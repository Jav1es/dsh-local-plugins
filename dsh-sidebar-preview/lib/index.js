/**
 * dsh-sidebar-preview, node half.
 *
 * A stub. Every feature this plugin provides — the image / PDF file
 * previewers — lives in the browser half, because each one renders inside
 * better-sidebar's editor host through `ctx.betterSidebar.registerFileViewer`
 * (a client-only service). The node half exists so the bundle's `main`
 * resolves cleanly.
 */
export const inject = [];
export function apply(_ctx, _config) {}
