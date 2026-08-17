(function () {
  const path = (location.pathname.split("/").pop() || "index.html").replace(/^\//, "");
  const page = path === "" || path === "/" ? "index.html" : path;

  const links = [
    ["index.html", "Start"],
    ["news.html", "News"],
    ["download.html", "Download"],
    ["screenshots.html", "Screenshots"],
    ["help.html", "Help&Support"],
    ["skins.html", "Skins"],
    ["forum.html", "Forum"],
    ["contentdb.html", "Content DB"],
    ["team.html", "Team"],
    ["contact.html", "Contact"],
    ["shop.html", "Shop"],
    ["/account/", "Account"],
  ];

  function hnav() {
    return links
      .map(([href, label]) => `<span class="dot">.:</span><a href="${href}">${label}</a>`)
      .join("");
  }

  window.vmuleChrome = function vmuleChrome(mainHtml) {
    return `
<div class="page">
  <div class="topbar">
    <div class="brand">
      <img src="/website/img/logo.svg" alt="vMule">
      <div>
        <h1>vMule-<span>Project.net</span></h1>
        <p>Official vMule Homepage. Downloads, Help, Docu, News...</p>
      </div>
    </div>
    <div class="verbox" id="verbox">
      LatestVersion: <b>0.51a</b><br>
      Community: <b>0.70b</b>
    </div>
  </div>
  <div class="hnav">${hnav()}</div>
  <div class="layout">
    <div class="col">
      <div class="box-h">.:vMuleNAV</div>
      <ul class="navlist">
        ${links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")}
        <li><a href="/client/">Open vMule client</a></li>
        <li><a href="/server-admin/">Server console</a></li>
      </ul>
      <div class="box-h">News Help</div>
      <div class="box-b muted">Read the FAQ before posting. The forum is staffed by volunteers, not paid support.</div>
      <div class="box-h">.:SiteSearch</div>
      <form class="searchbox" action="help.html" method="get">
        <input type="text" name="q" placeholder="Search help...">
        <button type="submit">Search</button>
      </form>
    </div>
    <div class="col main">${mainHtml}</div>
    <div class="col right">
      <div class="box-h">.:LatestNews</div>
      <div class="box-b" id="latest-news">Loading news...</div>
    </div>
  </div>
  <div class="footer">
    <div>vMule is free software inspired by the classic eMule client. Share files you are allowed to share.</div>
    <div><a href="contact.html">Contact</a> · <a href="/account/">Account</a> · <a href="/server-admin/">Server console</a></div>
  </div>
</div>`;
  };

  window.vmuleReady = async function () {
    try {
      const updates = await fetch("/api/updates").then((r) => r.json());
      const stable = updates.find((u) => u.channel === "stable");
      const community = updates.find((u) => u.channel === "community");
      const box = document.getElementById("verbox");
      if (box && stable) {
        box.innerHTML = `LatestVersion: <b>${stable.version}</b><br>Community: <b>${community ? community.version : "—"}</b>`;
      }
      const news = document.getElementById("latest-news");
      if (news) {
        news.innerHTML = updates
          .slice(0, 4)
          .map(
            (u) =>
              `<div class="newsitem"><span class="k">${u.channel}:</span> ${u.title}<br><a href="download.html"> (more)</a></div>`
          )
          .join("");
      }
    } catch {
      const news = document.getElementById("latest-news");
      if (news) news.innerHTML = "<div class='newsitem'>Could not load news.</div>";
    }
  };
})();
