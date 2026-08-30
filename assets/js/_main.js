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
