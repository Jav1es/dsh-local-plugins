/**
 * dsh-quick-panel — host half.
 *
 * 这个插件的全部能力都在 client 半（lib/client.js，由 package.json 的
 * `dsh.client` 声明、由 DSH 客户端模块表装载）。host 半只需要一行 loader 记录，
 * 让 `cordis.patch.yml` 的 `- id: quick-panel` 有对应的插件实现。
 *
 * 故意保持零副作用、零依赖：host 半不做扫描、不注册路由、不写文件。
 */

/** Stable Cordis plugin name (matches the loader row id in cordis.patch.yml). */
export const name = 'quick-panel'

/** No host-side services are required. */
export const inject = []

/** Host half body: intentionally empty — see the file header. */
export function apply() {}
