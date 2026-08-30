/* ==========================================================================
   Various functions that we want to use within the template
   ========================================================================== */

// Determine the expected state of the theme toggle, which can be "dark", "light", or
// "system". Default is "system".
let determineThemeSetting = () => {
  let themeSetting = localStorage.getItem("theme");
  return (themeSetting != "dark" && themeSetting != "light" && themeSetting != "system") ? "system" : themeSetting;
};

// Determine the computed theme, which can be "dark" or "light". If the theme setting is
// "system", the computed theme is determined based on the user's system preference.
let determineComputedTheme = () => {
  let themeSetting = determineThemeSetting();
  if (themeSetting != "system") {
    return themeSetting;
  }
  return (userPref && userPref("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
};

// detect OS/browser preference
const browserPref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Set the theme on page load or when explicitly called
let setTheme = (theme) => {
  const use_theme =
    theme ||
    localStorage.getItem("theme") ||
    $("html").attr("data-theme") ||
    browserPref;

  if (use_theme === "dark") {
    $("html").attr("data-theme", "dark");
    $("#theme-icon").removeClass("fa-sun").addClass("fa-moon");
  } else if (use_theme === "light") {
    $("html").removeAttr("data-theme");
    $("#theme-icon").removeClass("fa-moon").addClass("fa-sun");
  }
};

// Toggle the theme manually
var toggleTheme = () => {
  const current_theme = $("html").attr("data-theme");
  const new_theme = current_theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", new_theme);
  setTheme(new_theme);
  // autocapture는 이 클릭을 익명의 Element Clicked로만 남긴다 — 어느 방향으로 바꿨는지 기록
  if (window.amplitude && typeof window.amplitude.track === "function") {
    try {
      window.amplitude.track("theme_toggled", { to_theme: new_theme });
    } catch (e) {}
  }
};

/* ==========================================================================
   Plotly integration script so that Markdown codeblocks will be rendered
   ========================================================================== */

// Read the Plotly data from the code block, hide it, and render the chart as new node. This allows for the 
// JSON data to be retrieve when the theme is switched. The listener should only be added if the data is 
// actually present on the page.
import { plotlyDarkLayout, plotlyLightLayout } from './theme.js';
let plotlyElements = document.querySelectorAll("pre>code.language-plotly");
if (plotlyElements.length > 0) {
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
      plotlyElements.forEach((elem) => {
        // Parse the Plotly JSON data and hide it
        var jsonData = JSON.parse(elem.textContent);
        elem.parentElement.classList.add("hidden");

        // Add the Plotly node
        let chartElement = document.createElement("div");
        elem.parentElement.after(chartElement);

        // Set the theme for the plot and render it
        const theme = (determineComputedTheme() === "dark") ? plotlyDarkLayout : plotlyLightLayout;
        if (jsonData.layout) {
          jsonData.layout.template = (jsonData.layout.template) ? { ...theme, ...jsonData.layout.template } : theme;
        } else {
          jsonData.layout = { template: theme };
        }
        Plotly.react(chartElement, jsonData.data, jsonData.layout);
      });
    }
  });
}

/* ==========================================================================
   Actions that should occur when the page has been fully loaded
   ========================================================================== */

$(document).ready(function () {
  // SCSS SETTINGS - These should be the same as the settings in the relevant files 
  const scssLarge = 925;          // pixels, from /_sass/_themes.scss
  const scssMastheadHeight = 70;  // pixels, from the current theme (e.g., /_sass/theme/_default.scss)

  // If the user hasn't chosen a theme, follow the OS preference
  setTheme();
  window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener("change", (e) => {
          if (!localStorage.getItem("theme")) {
            setTheme(e.matches ? "dark" : "light");
          }
        });

  // Enable the theme toggle
  $('#theme-toggle').on('click', toggleTheme);

  // Enable the sticky footer
  var bumpIt = function () {
    $("body").css("margin-bottom", $(".page__footer").outerHeight(true));
  }
  $(window).resize(function () {
    didResize = true;
  });
  setInterval(function () {
    if (didResize) {
      didResize = false;
      bumpIt();
    }}, 250);
  var didResize = false;
  bumpIt();

  // FitVids init
  fitvids();

  // Follow menu drop down
  $(".author__urls-wrapper button").on("click", function () {
    $(".author__urls").fadeToggle("fast", function () { });
    $(".author__urls-wrapper button").toggleClass("open");
  });

  // Restore the follow menu if toggled on a window resize
  jQuery(window).on('resize', function () {
    if ($('.author__urls.social-icons').css('display') == 'none' && $(window).width() >= scssLarge) {
      $(".author__urls").css('display', 'block')
    }
  });

  // Init smooth scroll, this needs to be slightly more than then fixed masthead height
  $("a").smoothScroll({
    offset: -scssMastheadHeight,
    preventDefault: false,
  });

});

/* ==========================================================================
   스크롤 인 리빌 — corp.tossinvest.com의 opacity 0→1 + translateY(28px) 이식.
   외부 라이브러리(GSAP 등) 없이 IntersectionObserver만 쓴다.
   스타일은 _sass/_custom.scss §17.

   설계 두 가지:
   1) html에 .js-reveal을 붙인 뒤에만 요소가 숨겨진다. JS가 죽거나 꺼지면 클래스가
      없어 글이 그냥 보인다 — 콘텐츠가 사라지는 사고를 구조적으로 막는다.
   2) js-reveal을 붙이기 "전에" 이미 화면에 들어와 있는 항목을 is-in으로 확정한다.
      순서를 반대로 하면 첫 화면 카드가 숨겨졌다 나타나며 한 번 깜빡인다.
   ========================================================================== */
(function () {
  if (!("IntersectionObserver" in window)) { return; }

  var items = document.querySelectorAll(".reveal");
  if (!items.length) { return; }

  var vh = window.innerHeight || document.documentElement.clientHeight || 0;
  var i;

  for (i = 0; i < items.length; i++) {
    if (items[i].getBoundingClientRect().top < vh * 0.9) {
      items[i].classList.add("is-in");
    }
  }

  document.documentElement.classList.add("js-reveal");

  var io = new IntersectionObserver(function (entries) {
    for (var k = 0; k < entries.length; k++) {
      if (entries[k].isIntersecting) {
        entries[k].target.classList.add("is-in");
        io.unobserve(entries[k].target);
      }
    }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });

  for (i = 0; i < items.length; i++) {
    if (items[i].className.indexOf("is-in") === -1) { io.observe(items[i]); }
  }
})();

/* ==========================================================================
   사이드바 드로어 — 검색·라벨·아카이브를 화면 밖에 두고 손잡이로 꺼낸다.
   스타일은 _sass/_custom.scss §18.

   여는 경로가 셋인 이유: 호버는 터치·키보드 사용자에게 없고, 스와이프는 마우스
   사용자에게 없다. 클릭만이 모든 환경에 공통이라 어느 하나도 뺄 수 없다.
   ========================================================================== */
(function () {
  var layout = document.querySelector(".blog-layout[data-drawer]");
  if (!layout) { return; }

  var handle = layout.querySelector(".sidebar-handle");
  var sidebar = layout.querySelector(".blog-layout__sidebar");
  var scrim = layout.querySelector("[data-drawer-scrim]");
  if (!handle || !sidebar) { return; }

  var OPEN = "is-open";
  var LOCK = "is-drawer-locked";
  var closeTimer = null;
  var root = document.documentElement;

  /* 호버로 연 것과 클릭으로 연 것은 의미가 다르다.
     호버 = 임시(마우스가 떠나면 닫힘) / 클릭 = 고정(떠나도 유지).
     구분하지 않으면 호버로 열린 상태에서 손잡이를 누른 사용자가
     "열려고 눌렀는데 닫혔다"를 겪는다. */
  var pinned = false;

  function isOpen() { return layout.classList.contains(OPEN); }

  function open(moveFocus) {
    clearTimeout(closeTimer);
    layout.classList.add(OPEN);
    handle.setAttribute("aria-expanded", "true");
    handle.setAttribute("aria-label", "검색·라벨 메뉴 닫기");
    root.classList.add(LOCK);
    if (moveFocus) {
      var first = sidebar.querySelector("input, a, button");
      if (first) { first.focus(); }
    }
  }

  function close() {
    clearTimeout(closeTimer);
    pinned = false;
    layout.classList.remove(OPEN);
    handle.setAttribute("aria-expanded", "false");
    handle.setAttribute("aria-label", "검색·라벨 메뉴 열기");
    root.classList.remove(LOCK);
  }

  /* 클릭·키보드 — 모든 환경 공통 경로. stopPropagation이 없으면 아래
     document 클릭 핸들러가 같은 클릭을 받아 즉시 되닫는다.
     호버로 이미 열려 있어도 첫 클릭은 "닫기"가 아니라 "고정"이다. */
  handle.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (pinned) { close(); }
    else { pinned = true; open(true); }
  });

  /* 호버 — 마우스가 있는 기기에서만 단다. 터치에서 hover를 흉내내는
     브라우저가 있어 매체 질의로 걸러낸다. */
  if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var scheduleClose = function () {
      /* 클릭으로 고정한 드로어는 마우스가 벗어나도 닫지 않는다. */
      if (pinned) { return; }
      /* 사이드바 안에 키보드 포커스가 있으면 닫지 않는다 —
         검색어를 치는 중에 마우스가 벗어났다고 사라지면 안 된다. */
      if (sidebar.contains(document.activeElement)) { return; }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, 240);
    };
    var cancelClose = function () { clearTimeout(closeTimer); };

    handle.addEventListener("mouseenter", function () { cancelClose(); open(false); });
    handle.addEventListener("mouseleave", scheduleClose);
    sidebar.addEventListener("mouseenter", cancelClose);
    sidebar.addEventListener("mouseleave", scheduleClose);
  }

  if (scrim) {
    scrim.addEventListener("click", close);
  }

  document.addEventListener("click", function (e) {
    if (!isOpen()) { return; }
    if (sidebar.contains(e.target) || handle.contains(e.target)) { return; }
    close();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && isOpen()) {
      close();
      handle.focus();
    }
  });

  /* 스와이프.
     iOS Safari는 화면 왼쪽 가장자리에서 시작한 스와이프를 "뒤로가기"로 가로챈다.
     그래서 0~EDGE_IGNORE 구간에서 시작한 제스처는 아예 무시하고, 그보다 안쪽
     ZONE_END까지에서 시작해 오른쪽으로 그은 경우에만 연다. */
  var EDGE_IGNORE = 26;
  var ZONE_END = 100;
  var THRESHOLD = 45;
  var sx = null, sy = null, tracking = false;

  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    var t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    if (isOpen()) {
      tracking = sidebar.contains(e.target);
    } else {
      tracking = sx > EDGE_IGNORE && sx < ZONE_END;
    }
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!tracking || sx === null || e.touches.length !== 1) { return; }
    var t = e.touches[0];
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;
    /* 세로 의도가 더 크면 스크롤에 양보한다 */
    if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
    if (!isOpen() && dx > THRESHOLD) { open(false); tracking = false; }
    else if (isOpen() && dx < -THRESHOLD) { close(); tracking = false; }
  }, { passive: true });

  document.addEventListener("touchend", function () { tracking = false; }, { passive: true });
})();
