// Javascript for takealook-data.github.io Insight Archive Board

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    allInsights: [],
    filteredInsights: [],
    currentTab: "all",
    searchQuery: "",
    currentPage: 1,
    itemsPerPage: 9
  };

  // DOM Elements
  const gridEl = document.getElementById("insight-grid");
  const paginationEl = document.getElementById("insight-pagination");
  const searchInput = document.getElementById("insight-search");
  const tabButtons = document.querySelectorAll(".insight-tab-btn");

  // Initial Fetch
  async function fetchInsights() {
    try {
      // Fetch the json static database file
      const response = await fetch("/assets/data/insights.json");
      if (!response.ok) {
        throw new Error("Failed to load insights database.");
      }
      state.allInsights = await response.json();
      
      // Sort by date descending
      state.allInsights.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      state.filteredInsights = [...state.allInsights];
      render();
    } catch (error) {
      console.error("[ERROR] Fetching insights failed:", error);
      gridEl.innerHTML = `
        <div class="insight-empty">
          <div class="insight-empty-icon">⚠️</div>
          <div class="insight-empty-title">데이터를 불러오지 못했습니다</div>
          <p>서버 통신 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      `;
    }
  }

  // Filter & Search Logic
  function applyFilters() {
    // 1. Filter by Tab
    let results = state.allInsights;
    if (state.currentTab !== "all") {
      results = results.filter(item => item.type === state.currentTab);
    }

    // 2. Filter by Search Query
    if (state.searchQuery.trim() !== "") {
      const query = state.searchQuery.toLowerCase();
      results = results.filter(item => {
        const title = (item.title || "").toLowerCase();
        const company = (item.company || "").toLowerCase();
        const tags = (item.tags || []).map(t => t.toLowerCase());
        
        return title.includes(query) || 
               company.includes(query) || 
               tags.some(tag => tag.includes(query));
      });
    }

    state.filteredInsights = results;
    state.currentPage = 1; // Reset to page 1
    render();
  }

  // Render Grid Items
  function renderGrid() {
    gridEl.innerHTML = "";
    
    if (state.filteredInsights.length === 0) {
      gridEl.innerHTML = `
        <div class="insight-empty">
          <div class="insight-empty-icon">🔍</div>
          <div class="insight-empty-title">검색 결과가 없습니다</div>
          <p>다른 키워드나 필터 조건으로 검색해 보세요.</p>
        </div>
      `;
      return;
    }

    // Page slicing
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const endIndex = Math.min(startIndex + state.itemsPerPage, state.filteredInsights.length);
    const pageItems = state.filteredInsights.slice(startIndex, endIndex);

    pageItems.forEach(item => {
      const card = document.createElement("a");
      card.className = "insight-card";
      card.href = item.url || "#";
      card.target = "_blank";
      
      // Thumbnail & Background gradient placeholders
      let thumbHtml = "";
      if (item.image) {
        thumbHtml = `<div class="insight-card-thumb" style="background-image: url('${item.image}')"></div>`;
      } else {
        let bgClass = "";
        let placeholderText = "";
        if (item.type === "article") {
          bgClass = "art-bg";
          placeholderText = "COLUMN";
        } else if (item.type === "report") {
          bgClass = "rep-bg";
          placeholderText = "REPORT";
        } else {
          placeholderText = item.company ? item.company.substring(0, 4) : "JOB";
        }
        thumbHtml = `
          <div class="insight-card-thumb">
            <div class="insight-card-thumb-placeholder ${bgClass}">${placeholderText}</div>
          </div>
        `;
      }

      // Badges
      let badgeLabel = "채용";
      if (item.type === "article") badgeLabel = "아티클";
      else if (item.type === "report") badgeLabel = "보고서";
      
      const badgeHtml = `<span class="insight-badge ${item.type}">${badgeLabel}</span>`;

      // Tags List
      const tagsHtml = (item.tags || []).map(tag => `<span class="insight-card-tag">#${tag}</span>`).join("");

      // Date Formatting
      let dateText = item.date || "";
      let deadlineHtml = "";
      if (item.type === "job") {
        deadlineHtml = `<span class="insight-card-deadline">${item.deadline || "상시채용"}</span>`;
      } else {
        deadlineHtml = `<span class="insight-card-date">${dateText}</span>`;
      }

      card.innerHTML = `
        <div style="position: relative; overflow: hidden;">
          ${badgeHtml}
          ${thumbHtml}
        </div>
        <div class="insight-card-body">
          <div class="insight-card-company">${item.company || ""}</div>
          <h3 class="insight-card-title">${item.title || ""}</h3>
          <div class="insight-card-tags">
            ${tagsHtml}
          </div>
          <div class="insight-card-footer">
            <span class="insight-card-career">${item.career || "경력"}</span>
            ${deadlineHtml}
          </div>
        </div>
      `;
      
      gridEl.appendChild(card);
    });
  }

  // Render Pagination Buttons
  function renderPagination() {
    paginationEl.innerHTML = "";
    
    const totalPages = Math.ceil(state.filteredInsights.length / state.itemsPerPage);
    if (totalPages <= 1) return;

    // Prev Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "insight-page-btn";
    prevBtn.innerHTML = "&lt;";
    prevBtn.disabled = state.currentPage === 1;
    prevBtn.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        window.scrollTo({ top: gridEl.offsetTop - 100, behavior: "smooth" });
        render();
      }
    });
    paginationEl.appendChild(prevBtn);

    // Page Number Buttons
    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement("button");
      pageBtn.className = `insight-page-btn ${state.currentPage === i ? "active" : ""}`;
      pageBtn.textContent = i;
      pageBtn.addEventListener("click", () => {
        state.currentPage = i;
        window.scrollTo({ top: gridEl.offsetTop - 100, behavior: "smooth" });
        render();
      });
      paginationEl.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "insight-page-btn";
    nextBtn.innerHTML = "&gt;";
    nextBtn.disabled = state.currentPage === totalPages;
    nextBtn.addEventListener("click", () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        window.scrollTo({ top: gridEl.offsetTop - 100, behavior: "smooth" });
        render();
      }
    });
    paginationEl.appendChild(nextBtn);
  }

  // Main Render Coordinator
  function render() {
    renderGrid();
    renderPagination();
  }

  // Bind Listeners
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      applyFilters();
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // Toggle Active Tab class
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      state.currentTab = btn.getAttribute("data-tab");
      applyFilters();
    });
  });

  // Launch Fetching
  fetchInsights();
});
