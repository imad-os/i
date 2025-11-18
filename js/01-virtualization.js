/* ------------------------------
         Virtual list (lightweight) - FIXED
    Based on the example provided for Tizen performance.
    - fixes to pool sizing, node creation, 'vitem' class for navigation,
      scrollToIndex implementation, safer layout/re-render scheduling,
      and other small stability fixes.
    - Public API: { getCols, ensureVisible, highlight, refresh, scrollToIndex, destroy }
-------------------------------*/
var state = {};
const defaul_options = {
    container: null,
    itemCount: 0,
    itemHeight: 300,
    itemWidth: 150,
    renderItem: null,
    buffer: 4,
    mode: 'grid',
    cols: 6,
    poolMultiplier: 1.2,
    useTranslate: true,
    rendering: false,
    
};
(function (global) {
    'use strict';

    function createVirtualList(options) {
        const cfg = Object.assign(defaul_options, options || {});

        if (!cfg.container) throw new Error('container required');
        if (typeof cfg.renderItem !== 'function') throw new Error('renderItem required');

        state = {
            itemCount: Math.max(0, cfg.itemCount | 0),
            nodePool: [],
            viewportHeight: 0,
            viewportWidth: 0,
            rows: 0,
            cols: cfg.mode === 'grid' ? (cfg.cols || 1) : 1,
            rowHeight: Math.max(1, cfg.itemHeight | 0),
            colWidth: Math.max(1, cfg.itemWidth | 0),
            scheduled: false,
            destroyed: false,
            visibleRange: { firstRow: -1, lastRow: -1 },
            afterRenderCallback: null, // Callback to run after render
            cfg
        };

        // Ensure container has positioning context
        const containerStyle = window.getComputedStyle(cfg.container);
        if (containerStyle.position === 'static') {
            cfg.container.style.position = 'relative';
        }
        cfg.container.style.overflow = cfg.container.style.overflow || 'auto';

        // node pool container (sizer)
        const sizer = document.createElement('div');
        sizer.style.width = '100%';
        sizer.style.position = 'relative';
        sizer.style.display = 'block';
        sizer.style.boxSizing = 'border-box';
        state.sizer = sizer;
        cfg.container.appendChild(sizer);

        function createPoolNode() {
            const dom = document.createElement('div');
            // Give the node a clear class so external nav code can find it
            dom.className = 'vitem';
            dom.style.position = 'absolute';
            dom.style.left = '0';
            dom.style.top = '0';
            dom.style.display = 'none';
            dom.style.boxSizing = 'border-box';
            const node = { dom, index: -1, top: -1 };
            sizer.appendChild(dom);
            return node;
        }

        function recalcLayout() {
            if (state.destroyed) return;

            state.viewportHeight = cfg.container.clientHeight;
            state.viewportWidth = cfg.container.clientWidth;

            // If container not visible or size zero, bail — render() will retry
            if (state.viewportHeight === 0 || state.viewportWidth === 0) return;

            if (cfg.mode === 'grid') {
                // Auto-calculate cols if not provided
                if (!cfg.cols) {
                    state.cols = Math.max(1, Math.floor(state.viewportWidth / state.colWidth));
                } else {
                    state.cols = cfg.cols;
                }
                // Recalculate item width based on actual cols (equal distribution)
                state.colWidth = state.viewportWidth / state.cols;
            } else {
                state.cols = 1;
                state.colWidth = state.viewportWidth;
            }

            state.rows = Math.ceil(state.itemCount / state.cols);

            // Recalc pool size (use Math.ceil to ensure integer)
            const visibleRows = Math.ceil(state.viewportHeight / state.rowHeight);
            const poolSize = Math.ceil((visibleRows + (cfg.buffer * 2)) * state.cols * cfg.poolMultiplier);

            // Ensure at least one row worth
            const minPool = Math.max(1, Math.ceil(visibleRows * state.cols));
            const targetPool = Math.max(minPool, poolSize);

            while (state.nodePool.length < targetPool) {
                state.nodePool.push(createPoolNode());
            }
            while (state.nodePool.length > targetPool) {
                const n = state.nodePool.pop();
                if (n && n.dom && n.dom.parentNode) n.dom.parentNode.removeChild(n.dom);
            }

            // Apply sizing to nodes
            state.nodePool.forEach(node => {
                node.dom.style.width = Math.floor(state.colWidth) + 'px';
                node.dom.style.height = Math.floor(state.rowHeight) + 'px';
            });

            // Update sizer height to total virtual height
            state.sizer.style.height = (state.rows * state.rowHeight) + 'px';
        }

        function scheduleRender() {
            if (state.destroyed) return;
            if (state.scheduled) return;
            state.scheduled = true;
            requestAnimationFrame(render);
        }

        function render() {
            state.scheduled = false;
            if (state.destroyed) return;

            // --- Ensure container has non-zero size ---
            const newHeight = cfg.container.clientHeight;
            const newWidth = cfg.container.clientWidth;
            if (newHeight === 0 || newWidth === 0) {
                // Try again later
                setTimeout(scheduleRender, 100);
                return;
            }

            // If layout changed, recalc
            if (newHeight !== state.viewportHeight || newWidth !== state.viewportWidth) {
                recalcLayout();
            }

            // Destructure needed state
            const { itemCount, cols, rowHeight, viewportHeight, nodePool, colWidth, cfg: localCfg } = state;

            if (!nodePool || nodePool.length === 0) {
                // Nothing to render yet — ensure layout and try later
                recalcLayout();
                scheduleRender();
                return;
            }

            const scrollTop = cfg.container.scrollTop || 0;

            // Compute visible rows
            const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - localCfg.buffer);
            const lastRow = Math.min(state.rows - 1, Math.floor((scrollTop + viewportHeight) / rowHeight) + localCfg.buffer);

            state.visibleRange = { firstRow, lastRow };

            // Recycling
            const usedNodes = new Set();

            // Helper: find node by index among pool
            function findNodeByIndex(idx) {
                return nodePool.find(n => n.index === idx);
            }

            // Render grid cells for visible rows
            for (let row = firstRow; row <= lastRow; row++) {
                for (let col = 0; col < cols; col++) {
                    const index = (row * cols) + col;
                    if (index >= itemCount) continue;

                    // Try to find an already-assigned node
                    let node = findNodeByIndex(index);

                    if (node && !usedNodes.has(node)) {
                        usedNodes.add(node);
                        continue; // already correct
                    }

                    // Otherwise get an unused node to recycle
                    const unusedNode = nodePool.find(n => !usedNodes.has(n));
                    if (!unusedNode) {
                        console.error('Virtual list out of nodes!');
                        continue;
                    }

                    // mark used
                    usedNodes.add(unusedNode);

                    // assign index
                    unusedNode.index = index;
                    unusedNode.dom.style.display = 'block';

                    // position
                    const top = row * rowHeight;
                    const left = col * colWidth;

                    if (state.cfg.useTranslate) {
                        // Use translate3d for better performance on some TVs
                        unusedNode.dom.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
                    } else {
                        unusedNode.dom.style.left = Math.round(left) + 'px';
                        unusedNode.dom.style.top = Math.round(top) + 'px';
                    }

                    // set metadata for nav and for renderer
                    unusedNode.dom.dataset.virtualIndex = index;
                    // Render item into DOM node
                    try {
                        cfg.renderItem(index, unusedNode.dom);
                    } catch (e) {
                        // Backwards compatibility: support renderItem(dom, index)
                        try {
                            cfg.renderItem(unusedNode.dom, index);
                        } catch (err) {
                            console.error('renderItem failed for index', index, err);
                            unusedNode.dom.innerHTML = '';
                        }
                    }
                }
            }

            // Hide any nodes that are not used
            nodePool.forEach(node => {
                if (!usedNodes.has(node)) {
                    if (node.dom.style.display !== 'none') {
                        node.dom.style.display = 'none';
                        node.index = -1;
                        node.dom.removeAttribute('data-virtual-index');
                    }
                }
            });

            // Update sizer height if needed (in case itemCount changed)
            const totalHeight = (state.rows * state.rowHeight);
            if (state.sizer.style.height !== (totalHeight + 'px')) {
                state.sizer.style.height = totalHeight + 'px';
            }

            // After render callback
            if (state.afterRenderCallback) {
                try { state.afterRenderCallback(); } catch (e) { console.error(e); }
                state.afterRenderCallback = null;
            }
        }

        // Event listeners
        let onScroll = () => scheduleRender();
        cfg.container.addEventListener('scroll', onScroll);
        const onResize = () => {
            recalcLayout();
            scheduleRender();
        };
        window.addEventListener('resize', onResize);

        function destroy() {
            state.destroyed = true;
            cfg.container.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            // remove sizer
            if (state.sizer && state.sizer.parentNode) state.sizer.parentNode.removeChild(state.sizer);
            state.nodePool = [];
            state = {};
        }

        function getCols() { return state.cols; }

        // ensureVisible now supports callback after visible
        function ensureVisible(index, callback) {
            if (index < 0 || index >= state.itemCount) {
                if (callback) callback();
                return;
            }

            const cols = state.cols;
            const itemRow = Math.floor(index / cols);

            const { firstRow, lastRow } = state.visibleRange;
            const eTop = itemRow * state.rowHeight;
            const eBottom = eTop + state.rowHeight;
            const cTop = cfg.container.scrollTop;
            const cBottom = cTop + cfg.container.clientHeight;

            if (itemRow < firstRow || itemRow > lastRow) {
                // Outside current rendered range — adjust scroll to bring it into view
                if (eTop < cTop) {
                    cfg.container.scrollTop = eTop;
                } else {
                    cfg.container.scrollTop = Math.max(0, (eBottom - cfg.container.clientHeight));
                }
                state.afterRenderCallback = callback;
                scheduleRender();
                return;
            }

            // If inside rendered range, still may need small scroll adjustments
            if (eTop < cTop) cfg.container.scrollTop = eTop;
            else if (eBottom > cBottom) cfg.container.scrollTop = eBottom - cfg.container.clientHeight;

            if (callback) callback();
        }

        function highlight(index) {
            // Remove focused from all visible nodes, and add to the node that matches index
            state.nodePool.forEach(n => {
                if (n.dom) n.dom.classList.remove('focused');
            });

            const node = state.nodePool.find(n => n.index === index && n.dom.style.display !== 'none');
            if (node && node.dom) node.dom.classList.add('focused');

            let pool_indx=0;
            for (let ind = 0; ind < state.nodePool.length; ind++) {
               if(state.nodePool[ind].index===index){
                    pool_indx = ind;
               }
               
            }
            $("#virtualization-position").textContent = `${Math.floor(index/state.cols)}/${Math.floor(state.itemCount/state.cols)}`;
            $("#virtualization-position").textContent += `  ${Math.floor(pool_indx/state.cols)}/${Math.floor(state.nodePool.length/state.cols)}`;
        }

        function refresh() { scheduleRender(); }

        function scrollToIndex(i) {
            if (i < 0) i = 0;
            if (i >= state.itemCount) i = state.itemCount - 1;
            const row = Math.floor(i / state.cols);
            const top = row * state.rowHeight;
            cfg.container.scrollTop = top;
            // ensure a render occurs afterwards and that a callback can be set externally
            scheduleRender();
        }

        // Public API
        // Do an initial layout + render schedule
        recalcLayout();
        scheduleRender();

        return {
            getCols,
            ensureVisible,
            highlight,
            refresh,
            destroy,
            scrollToIndex
        };
    }

    global.createVirtualList = createVirtualList;

})(window);
