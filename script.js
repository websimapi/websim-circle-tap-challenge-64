import { Game } from './game.js';
import { UIController } from './ui.js';
import { submitScore, migrateUserScores } from './leaderboard.js';
import { showReplay, hideReplay } from './replay.js';
import { playBackgroundMusic, fadeInMusic, fadeOutMusic, toggleMute } from './audio.js';
import { LeaderboardController } from './leaderboard-controller.js';
import { InputController } from './input-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    let hasInteracted = false;

    const handleFirstInteraction = () => {
        if (!hasInteracted) {
            hasInteracted = true;
            playBackgroundMusic();
        }
    };
    
    // UI Elements
    const elements = {
        scoreDisplay: document.getElementById('score-display'),
        scoreEl: document.getElementById('score'),
        levelDisplay: document.getElementById('level-display'),
        startMenu: document.getElementById('start-menu'),
        gameOverMenu: document.getElementById('game-over-menu'),
        finalScoreEl: document.getElementById('final-score'),
        homeBtn: document.getElementById('home-btn'),
        difficultyBtns: document.querySelectorAll('.difficulty-btn'),
        replayBtn: document.getElementById('replay-btn'),
        replayContainer: document.getElementById('replay-container'),
        closeReplayBtn: document.getElementById('close-replay-btn'),
        submitScoreBtn: document.getElementById('submit-score-btn'),
        leaderboardBtn: document.getElementById('leaderboard-btn'),
        leaderboardView: document.getElementById('leaderboard-view'),
        closeLeaderboardBtn: document.getElementById('close-leaderboard-btn'),
        leaderboardList: document.getElementById('leaderboard-list'),
        leaderboardDifficultyFilters: document.getElementById('leaderboard-difficulty-filters'),
        leaderboardFilterBtns: document.querySelectorAll('.leaderboard-filter-btn'),
        leaderboardPagination: document.getElementById('leaderboard-pagination'),
        musicToggleBtn: document.getElementById('music-toggle-btn'),
        tapToRestart: document.getElementById('tap-to-restart')
    };

    const game = new Game(canvas);
    const ui = new UIController(elements);
    
    let replayOrigin = 'gameover'; // 'gameover' or 'leaderboard'
    let leaderboardOrigin = 'start';
    let currentDifficulty = 'easy';

    // Initialize Controllers
    const leaderboardController = new LeaderboardController(elements, ui, {
        onReplay: (replayData) => {
            replayOrigin = 'leaderboard';
            fadeOutMusic();
            elements.leaderboardView.classList.add('hidden');
            ui.showReplayContainer();
            showReplay(replayData);
        },
        onInteraction: handleFirstInteraction
    });

    const inputController = new InputController(game, handleFirstInteraction);
    inputController.init();

    // removed leaderboard logic, state variables and handlers (moved to LeaderboardController)
    // removed tap and spacebar handlers (moved to InputController)

    // Set up game callbacks
    game.onScoreUpdate = (score) => ui.updateScore(score);
    game.onLevelUp = (level, isInitial) => ui.updateLevel(level, isInitial);
    game.onGameOver = (gameData) => {
        ui.showGameOverMenu(gameData.score);
    };

    // Difficulty Selection
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling to start menu
            handleFirstInteraction(); // Start audio on difficulty select
            const difficulty = btn.dataset.difficulty;
            currentDifficulty = difficulty;
            ui.updateDifficulty(difficulty);
            game.setDifficulty(difficulty); // Update visuals
        });
    });

    // Tap to Start
    elements.startMenu.addEventListener('click', (e) => {
        // Prevent starting if clicking on difficulty buttons (just in case stopPropagation fails or structure changes)
        if (e.target.closest('.difficulty-selector')) return;
        
        handleFirstInteraction();
        game.start(currentDifficulty);
        ui.showGameScreen();
    });

    // Game Over Menu Tap to Restart
    elements.gameOverMenu.addEventListener('click', (e) => {
        // Don't trigger if clicking buttons or interactions inside
        if (e.target.closest('button') || e.target.closest('.difficulty-selector')) return;
        
        // Prevent accidental restart if text is not visible yet
        if (elements.tapToRestart && elements.tapToRestart.style.opacity === '0') return;

        ui.clearTimeouts();
        game.reset();
        ui.showGameScreen();
        game.start(currentDifficulty);
    });

    // Home button
    elements.homeBtn.addEventListener('click', () => {
        ui.clearTimeouts();
        game.reset();
        ui.showStartMenu();
    });

    // Replay button (from Game Over)
    elements.replayBtn.addEventListener('click', async () => {
        handleFirstInteraction();
        replayOrigin = 'gameover';
        fadeOutMusic();
        ui.showReplayContainer();
        
        if (!game.replayConfig.currentUser) {
            try {
                const currentUser = await window.websim.getCurrentUser();
                game.replayConfig.currentUser = currentUser;
            } catch (error) {
                console.error("Could not get current user for replay:", error);
                game.replayConfig.currentUser = null;
            }
        }

        showReplay({
            frames: game.replayFrames,
            config: game.replayConfig
        });
    });

    elements.closeReplayBtn.addEventListener('click', () => {
        ui.hideReplayContainer(replayOrigin);
        hideReplay();
        fadeInMusic();
    });

    // Submit score button
    elements.submitScoreBtn.addEventListener('click', async () => {
        ui.setSubmitButtonState('disabled', 'Submitting...');
        
        await submitScore(
            game.lastGameData,
            () => ui.setSubmitButtonState('disabled', 'Submitted!'),
            () => {
                ui.setSubmitButtonState('disabled', 'Error!');
                setTimeout(() => {
                    ui.setSubmitButtonState('enabled', 'Submit Score');
                }, 2000);
            }
        );
    });

    // Music Toggle
    let isMuted = false;
    elements.musicToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger game tap
        handleFirstInteraction(); // Ensure audio context is ready
        isMuted = !isMuted;
        toggleMute(isMuted);
        
        const onIcon = elements.musicToggleBtn.querySelector('.volume-on');
        const offIcon = elements.musicToggleBtn.querySelector('.volume-off');
        
        if (isMuted) {
            onIcon.classList.add('hidden');
            offIcon.classList.remove('hidden');
        } else {
            onIcon.classList.remove('hidden');
            offIcon.classList.add('hidden');
        }
    });

    // Leaderboard button (Game Over)
    elements.leaderboardBtn.addEventListener('click', () => {
        leaderboardOrigin = 'gameover';
        leaderboardController.show('easy');
    });

    // Leaderboard button (Start Menu)
    const startLeaderboardBtn = document.getElementById('start-leaderboard-btn');
    if (startLeaderboardBtn) {
        startLeaderboardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            leaderboardOrigin = 'start';
            leaderboardController.show('easy');
        });
    }

    elements.closeLeaderboardBtn.addEventListener('click', () => {
        ui.hideLeaderboardView(leaderboardOrigin);
    });

    // Responsive UI Scaling
    const updateUIScale = () => {
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        // Base scale on a reference dimension of 450px
        // Allow it to scale down to 0.6 (small inline) and up to 1.2 (desktop)
        const scale = Math.min(Math.max(minDim / 450, 0.6), 1.2);
        document.documentElement.style.setProperty('--ui-scale', scale);
    };

    // Window resize
    window.addEventListener('resize', () => {
        game.resizeCanvas();
        updateUIScale();
    });

    // Initial setup
    updateUIScale();
    game.reset();
    ui.updateDifficulty(currentDifficulty);
    game.setDifficulty(currentDifficulty);
    migrateUserScores();
});