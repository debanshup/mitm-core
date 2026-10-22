import { defineConfig } from "vitepress";
import typedocSidebar from "../api/typedoc-sidebar.json";

export default defineConfig({
  base:"/",
  title: "mitm-core",
  description:
    "A TypeScript proxy framework for inspecting and processing HTTP, HTTPS, WebSocket, and secure WebSocket traffic.",
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ["meta", { name: "theme-color", content: "#0b1020" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "A TypeScript proxy framework for inspecting and processing HTTP, HTTPS, WebSocket, and secure WebSocket traffic.",
      },
    ],
  ],

  themeConfig: {
    logo: "https://github.com/debanshup/mitm-core/blob/main/assets/logo.png?raw=true",
    siteTitle: "mitm-core",

    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Configuration", link: "/configuration" },
      { text: "API Reference", link: "/api" },
      {
        text: "GitHub",
        link: "https://github.com/debanshup/mitm-core",
      },
    ],

    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
      {
        text: "Core concepts",
        items: [
          { text: "Proxy Events", link: "/proxy-events" },
          { text: "Rules", link: "/rules" },
          { text: "Plugins", link: "/plugins" },
        ],
      },
      {
        text: "Help",
        items: [{ text: "Troubleshooting", link: "/troubleshooting" }],
      },
      {
        text: "API Reference",
        items: typedocSidebar,
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/debanshup/mitm-core" },
    ],

    editLink: {
      pattern: "https://github.com/debanshup/mitm-core/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      copyright: "Released under the MIT License.",
    },
  },
});
