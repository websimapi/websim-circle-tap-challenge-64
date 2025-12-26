import { fetchLeaderboard, renderLeaderboardList, renderLeaderboardPagination, syncScores } from './leaderboard.js';

export class LeaderboardController {
    constructor(elements, ui, callbacks) {
        this.elements = elements;
        this.ui = ui;
        this.callbacks = callbacks || {}; // { onReplay: (data) => {}, onInteraction: () => {} }
        
        this.state = {
            currentPage: 1,
            totalPages: 1,
            itemsPerPage: 10,
            currentDifficulty: 'easy'
        };
        
        this.data = {
            rankedPlayers: [],
            cache: { easy: null, medium: null, hard: null }
        };
        
        this.isMyScoresActive = false;
        this.currentUser = null;
        
        this._bindMethods();
        this._addEventListeners();
    }

    _bindMethods() {
        this.handleFilterClick = this.handleFilterClick.bind(this);
        this.handlePaginationClick = this.handlePaginationClick.bind(this);
        this.handlePaginationChange = this.handlePaginationChange.bind(this);
        this.handleListClick = this.handleListClick.bind(this);
    }

    _addEventListeners() {
        this.elements.leaderboardDifficultyFilters.addEventListener('click', this.handleFilterClick);
        this.elements.leaderboardPagination.addEventListener('click', this.handlePaginationClick);
        this.elements.leaderboardPagination.addEventListener('change', this.handlePaginationChange);
        this.elements.leaderboardList.addEventListener('click', this.handleListClick);
    }

    async show(difficulty = 'easy') {
        if (this.callbacks.onInteraction) this.callbacks.onInteraction();
        syncScores();
        this.loadLeaderboard(difficulty);
    }

    async loadLeaderboard(difficulty) {
        this.state.currentDifficulty = difficulty;
        this.isMyScoresActive = false;
        this.state.currentPage = 1;
        
        this.ui.showLeaderboardView();
        this.elements.leaderboardList.innerHTML = '<p>Loading scores...</p>';
        this.ui.hidePagination();
        this.data.rankedPlayers = [];

        this._updateFilterButtons(difficulty);

        try {
            if (this.data.cache[difficulty]) {
                this.data.rankedPlayers = this.data.cache[difficulty];
            } else {
                this.data.rankedPlayers = await fetchLeaderboard(difficulty);
                this.data.cache[difficulty] = this.data.rankedPlayers;
            }
            
            this.state.totalPages = Math.ceil(this.data.rankedPlayers.length / this.state.itemsPerPage);

            if (this.data.rankedPlayers.length === 0) {
                this.elements.leaderboardList.innerHTML = `<p>No scores for ${difficulty} difficulty yet. Be the first!</p>`;
                this.ui.hidePagination();
            } else {
                this._render();
                this.ui.showPagination();
            }
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            this.elements.leaderboardList.innerHTML = '<p>Could not load leaderboard. Please try again later.</p>';
            this.ui.hidePagination();
        }
    }

    _updateFilterButtons(activeDifficulty) {
        this.elements.leaderboardFilterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.difficulty === activeDifficulty);
        });
        const myScoresBtn = document.getElementById('my-scores-btn');
        if (myScoresBtn) myScoresBtn.classList.remove('active');
    }

    async handleFilterClick(e) {
        const targetBtn = e.target.closest('.leaderboard-filter-btn');
        if (!targetBtn || targetBtn.classList.contains('active')) return;
        
        const difficulty = targetBtn.dataset.difficulty;

        if (difficulty === 'mine') {
            await this._switchToMyScores(targetBtn);
        } else {
            this.loadLeaderboard(difficulty);
        }
    }

    async _switchToMyScores(targetBtn) {
        this.isMyScoresActive = true;
        this.state.currentPage = 1;
        
        this.elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
        
        if (!this.currentUser) {
            try {
                this.currentUser = await window.websim.getCurrentUser();
            } catch {
                 this.elements.leaderboardList.innerHTML = `<p>Could not verify user. Please try again.</p>`;
                 return;
            }
        }

        if (!this.data.cache[this.state.currentDifficulty]) {
            await this.loadLeaderboard(this.state.currentDifficulty);
            this.elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
            targetBtn.classList.add('active');
        }
        
        this._render();
    }

    _render() {
        const { currentPage, itemsPerPage } = this.state;
        let dataToRender = this.data.rankedPlayers;
        
        if (this.isMyScoresActive && this.currentUser) {
            const myData = this.data.rankedPlayers.find(p => p.username === this.currentUser.username);
            dataToRender = myData ? [myData] : [];
        }

        this.elements.leaderboardList.innerHTML = renderLeaderboardList(dataToRender, currentPage, itemsPerPage);
        
        const totalPages = Math.ceil(dataToRender.length / itemsPerPage);
        this.state.totalPages = totalPages;

        if (totalPages > 1) {
            this.elements.leaderboardPagination.innerHTML = renderLeaderboardPagination(totalPages, currentPage);
            this.ui.showPagination();
        } else {
            this.ui.hidePagination();
        }
    }

    handlePaginationClick(e) {
        const target = e.target;
        let pageChanged = false;
        const { currentPage, totalPages } = this.state;
        
        if (target.id === 'first-page-btn' && currentPage > 1) {
            this.state.currentPage = 1;
            pageChanged = true;
        } else if (target.id === 'prev-page-btn' && currentPage > 1) {
            this.state.currentPage--;
            pageChanged = true;
        } else if (target.id === 'next-page-btn' && currentPage < totalPages) {
            this.state.currentPage++;
            pageChanged = true;
        } else if (target.id === 'last-page-btn' && currentPage < totalPages) {
            this.state.currentPage = totalPages;
            pageChanged = true;
        }

        if (pageChanged) {
            this._render();
        }
    }

    handlePaginationChange(e) {
        const target = e.target;
        if (target.id === 'page-input') {
            let newPage = parseInt(target.value, 10);
            if (!isNaN(newPage)) {
                newPage = Math.max(1, Math.min(newPage, this.state.totalPages));
                this.state.currentPage = newPage;
                this._render();
            }
        }
    }

    async handleListClick(e) {
        const watchBtn = e.target.closest('.watch-replay-btn');
        const entry = e.target.closest('.leaderboard-entry');

        if (watchBtn) {
            e.stopPropagation();
            await this._handleReplayClick(watchBtn);
        } else if (entry) {
            const scoreList = entry.nextElementSibling;
            if (scoreList && scoreList.classList.contains('score-list-container')) {
                scoreList.classList.toggle('hidden');
                entry.classList.toggle('expanded');
            }
        }
    }

    async _handleReplayClick(watchBtn) {
        const index = watchBtn.dataset.index;
        const scoreIndex = watchBtn.dataset.scoreIndex;
        const playerData = this.data.rankedPlayers[index];
        
        const gameData = scoreIndex !== undefined
            ? playerData.allScores[scoreIndex]
            : playerData.bestGameData;

        if (playerData && gameData && gameData.replayDataUrl) {
            try {
                const originalHtml = watchBtn.innerHTML;
                watchBtn.innerHTML = '<span style="font-size: 0.6rem;">...</span>'; 
                watchBtn.disabled = true;

                const response = await fetch(gameData.replayDataUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const replayData = await response.json();

                if (!replayData.config.currentUser) {
                    replayData.config.currentUser = {
                        username: playerData.username,
                        avatar_url: `https://images.websim.com/avatar/${playerData.username}`
                    };
                }

                if (this.callbacks.onReplay) {
                    this.callbacks.onReplay(replayData);
                }
                
                watchBtn.innerHTML = originalHtml;
                watchBtn.disabled = false;

            } catch (fetchError) {
                console.error("Error fetching replay data:", fetchError);
                alert("Could not load replay.");
                watchBtn.innerHTML = '<span style="font-size: 0.6rem;">X</span>';
                setTimeout(() => {
                    watchBtn.innerHTML = originalHtml;
                    watchBtn.disabled = false;
                }, 2000);
            }
        }
    }
}