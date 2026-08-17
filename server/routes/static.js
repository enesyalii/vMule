const path = require("path");
const express = require("express");
const config = require("../config");

const WEBSITE_PAGES = [
  "news", "download", "screenshots", "help", "skins", "forum",
  "contentdb", "team", "contact", "shop", "shop-success", "shop-cancel",
];

function mountStatic(app) {
  const publicDir = config.publicDir;
  const websiteDir = path.join(publicDir, "website");

  app.get("/", (_req, res) => {
    res.sendFile(path.join(websiteDir, "index.html"));
  });

  for (const page of WEBSITE_PAGES) {
    app.get(`/${page}.html`, (_req, res) => {
      res.sendFile(path.join(websiteDir, `${page}.html`));
    });
    app.get(`/${page}`, (_req, res) => {
      res.sendFile(path.join(websiteDir, `${page}.html`));
    });
  }

  app.use("/client", express.static(path.join(publicDir, "client")));
  app.use("/panel", express.static(path.join(publicDir, "panel")));
  app.use("/website", express.static(path.join(publicDir, "website")));
  app.use(express.static(websiteDir));

  app.get("/downloads/:file", (_req, res) => {
    res.redirect(config.INSTALLER_URL);
  });
}

module.exports = { mountStatic };
