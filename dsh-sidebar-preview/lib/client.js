window.__ModuleLoader__.load({
	id: "dsh-sidebar-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// Dependencies from the client bundle runtime (only react-family).
		const React = require("react");

		// ------------------------------------------------------------------
		// Icons (zero-dep): simple inline SVG so we never depend on an icon kit.
		// ------------------------------------------------------------------
		function IconImage({ size = 14 }) {
			return React.createElement("svg", {
				width: size, height: size, viewBox: "0 0 16 16",
				fill: "currentColor", "aria-hidden": true,
				style: { display: "block" }
			},
				React.createElement("path", { d: "M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1.5 8.5 2.5-3 2 2.25L10 8l3 3.5H3.5zM5 5.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" })
			);
		}

		function IconPdf({ size = 14 }) {
			return React.createElement("svg", {
				width: size, height: size, viewBox: "0 0 16 16",
				fill: "currentColor", "aria-hidden": true,
				style: { display: "block" }
			},
				React.createElement("path", { d: "M4 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5a.5.5 0 0 0-.146-.354l-3-3A.5.5 0 0 0 9.5 2H9v3h3v9H4V1zm5 1.707L10.293 4H9V2.707z" })
			);
		}

		// ------------------------------------------------------------------
		// Shared styles
		// ------------------------------------------------------------------
		const imgStyle = {
			display: "block",
			maxWidth: "100%",
			maxHeight: "100%",
			margin: "0 auto",
			objectFit: "contain"
		};
		const fillStyle = {
			width: "100%",
			height: "100%",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "12px",
			gap: "8px"
		};

		// ------------------------------------------------------------------
		// Image viewer component
		// ------------------------------------------------------------------
		function ImageView({ mediaUrl, title }) {
			const [status, setStatus] = React.useState("loading");
			if (!mediaUrl) {
				return React.createElement("div", { style: fillStyle }, "无法预览：缺少媒体地址");
			}
			return React.createElement("div", {
				style: { width: "100%", height: "100%", overflow: "auto", padding: "12px", boxSizing: "border-box" }
			},
				React.createElement("img", {
					src: mediaUrl,
					alt: title || "",
					style: imgStyle,
					onLoad: () => setStatus("ready"),
					onError: () => setStatus("error")
				}),
				status === "error" && React.createElement("div", { style: fillStyle },
					"图片加载失败",
					React.createElement("a", { href: mediaUrl, target: "_blank", rel: "noreferrer" }, "下载查看")
				)
			);
		}

		// ------------------------------------------------------------------
		// PDF viewer component (native browser PDF via iframe)
		// ------------------------------------------------------------------
		function PdfView({ mediaUrl, title }) {
			if (!mediaUrl) {
				return React.createElement("div", { style: fillStyle }, "无法预览：缺少媒体地址");
			}
			return React.createElement("iframe", {
				src: mediaUrl,
				title: title || "PDF",
				style: { width: "100%", height: "100%", border: "none", display: "block" }
			});
		}

		// ------------------------------------------------------------------
		// Viewer descriptors
		// ------------------------------------------------------------------
		function viewers() {
			return [
				{
					id: "dsh-image",
					title: () => "图片",
					icon: (size) => React.createElement(IconImage, { size }),
					exts: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"],
					fetchStrategy: "mediaUrl",
					priority: 10,
					component: (props) => React.createElement(ImageView, { ...props })
				},
				{
					id: "dsh-pdf",
					title: () => "PDF",
					icon: (size) => React.createElement(IconPdf, { size }),
					exts: ["pdf"],
					fetchStrategy: "mediaUrl",
					priority: 10,
					component: (props) => React.createElement(PdfView, { ...props })
				}
			];
		}

		// ------------------------------------------------------------------
		// Plugin body
		// ------------------------------------------------------------------
		const inject = ["betterSidebar"];

		function apply(ctx) {
			const betterSidebar = ctx.betterSidebar;
			if (betterSidebar === undefined) return;
			for (const viewer of viewers()) {
				ctx.effect(() => betterSidebar.registerFileViewer(viewer), `dsh-sidebar-preview: viewer ${viewer.id}`);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.viewers = viewers;
		return module.exports;
	}
});
