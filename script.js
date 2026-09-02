const startScreen = document.getElementById("start-screen");
const missionScreen = document.getElementById("mission-screen");
const gambitScreen = document.getElementById("gambit-screen");
const proposalScreen = document.getElementById("proposal-screen");
const endingScreen = document.getElementById("ending-screen");
const gameoverScreen = document.getElementById("gameover-screen");

const startButton = document.getElementById("start-button");
const dialogueNext = document.getElementById("dialogue-next");
const yesButton = document.getElementById("yes-button");
const noButton = document.getElementById("no-button");
const restartButton = document.getElementById("restart-button");
const gameoverRestartButton = document.getElementById("gameover-restart-button");
const musicToggle = document.getElementById("music-toggle");

const rogue = document.getElementById("rogue");
const gambit = document.getElementById("gambit");
const map = document.getElementById("map");

const walls = document.querySelectorAll(".wall");
const enemyElements = document.querySelectorAll(".enemy");

const scoreElement = document.getElementById("score");
const missionStatus = document.getElementById("mission-status");
const gameMessage = document.getElementById("game-message");
const dialogueText = document.getElementById("dialogue-text");
const livesElement = document.getElementById("lives");

let score = 0;
let missionComplete = false;
let gameStarted = false;
let gambitSpotted = false;
let isGameOver = false;
let invulnerable = false;

const MAX_LIVES = 3;
let livesRemaining = MAX_LIVES;

const SPAWN_SHIELD_MS = 1200;

const speed = 4;

let roguePosition = {
    x: 35,
    y: 35
};

const keys = {};

const dialogueLines = [
    "Well, well... look who finally found me.",
    "I was starting to wonder if you'd ever make it.",
    "You know, chère... I didn't exactly make this easy for you.",
    "But there's something I've been meaning to ask you.",
    "Something I think deserves more than a card trick."
];

let dialogueIndex = 0;

/* ============================================================
   ENEMIGOS — estado inicial

   Cada enemigo rebota dentro de los límites del mapa con su
   propia velocidad. No colisionan con las paredes (son pequeños
   drones que sobrevuelan la ciudad), pero sí con Rogue.
============================================================ */

const enemyStartPositions = [
    { x: 420, y: 230 },
    { x: 260, y: 120 },
    { x: 560, y: 340 }
];

const enemyDirections = [
    { vx: 1.5, vy: -1.1 },
    { vx: -1.3, vy: 1.2 },
    { vx: 1.2, vy: 1.3 }
];

const enemyState = Array.from(enemyElements).map(function(el, index) {
    const start = enemyStartPositions[index] || { x: 300, y: 220 };
    const dir = enemyDirections[index] || { vx: 1.5, vy: -1.5 };

    return {
        el: el,
        startX: start.x,
        startY: start.y,
        x: start.x,
        y: start.y,
        vx: dir.vx,
        vy: dir.vy
    };
});

/* ============================================================
   MÚSICA — secuenciador techno con Web Audio API

   No usa archivos de audio (evita temas de licencias); todo el
   sonido se sintetiza en tiempo real: un kick con barrido de
   frecuencia, un hi-hat de ruido filtrado, y una línea de bajo
   en diente de sierra que arpegia un pequeño riff. Se usa un
   "lookahead scheduler" (patrón estándar de Web Audio) para que
   el tempo se mantenga estable aunque el hilo principal esté
   ocupado con el juego.
============================================================ */

let audioCtx = null;
let musicEnabled = true;
let schedulerTimer = null;
let currentStep = 0;
let nextStepTime = 0;

const BPM = 128;
const STEP_SECONDS = 60 / BPM / 4; // dieciseisavos
const SCHEDULE_AHEAD = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

const KICK_STEPS = [0, 4, 8, 12];
const HAT_STEPS = [2, 6, 10, 14];

// Riff de bajo en La menor, 16 pasos (null = silencio)
const BASS_PATTERN = [
    110.00, null, 110.00, null,
    130.81, null, 110.00, null,
    98.00, null, 110.00, null,
    130.81, null, 146.83, null
];

function ensureAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

function playKick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.18);
}

function playHat(time) {
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.05);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.05);
}

function playBassNote(time, freq) {
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.value = 900;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.16, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.2);
}

function scheduleStep(step, time) {
    if (KICK_STEPS.indexOf(step) !== -1) {
        playKick(time);
    }

    if (HAT_STEPS.indexOf(step) !== -1) {
        playHat(time);
    }

    const note = BASS_PATTERN[step];

    if (note) {
        playBassNote(time, note);
    }
}

function scheduler() {
    while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
        scheduleStep(currentStep % 16, nextStepTime);
        nextStepTime += STEP_SECONDS;
        currentStep++;
    }
}

function startMusic() {
    if (!musicEnabled || schedulerTimer) {
        return;
    }

    ensureAudioContext();

    currentStep = 0;
    nextStepTime = audioCtx.currentTime + 0.05;

    schedulerTimer = setInterval(scheduler, SCHEDULER_INTERVAL_MS);
}

function stopMusic() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

musicToggle.addEventListener("click", function() {
    musicEnabled = !musicEnabled;
    musicToggle.textContent = musicEnabled ? "🔊" : "🔇";

    if (musicEnabled) {
        startMusic();
    } else {
        stopMusic();
    }
});

function showScreen(screen) {
    document.querySelectorAll(".screen").forEach(function(section) {
        section.classList.remove("active");
    });

    screen.classList.add("active");
}

function updateLivesDisplay() {
    const hearts = [];

    for (let i = 0; i < MAX_LIVES; i++) {
        hearts.push(i < livesRemaining ? "♥" : "♡");
    }

    livesElement.textContent = hearts.join(" ");
}

function resetGame() {
    score = 0;
    missionComplete = false;
    gameStarted = true;
    gambitSpotted = false;
    isGameOver = false;
    livesRemaining = MAX_LIVES;

    scoreElement.textContent = "000000";
    missionStatus.textContent = "FIND GAMBIT";
    gameMessage.textContent = "FIND GAMBIT. HE IS SOMEWHERE IN THE CITY...";

    updateLivesDisplay();

    roguePosition.x = 35;
    roguePosition.y = 35;

    rogue.style.left = roguePosition.x + "px";
    rogue.style.bottom = roguePosition.y + "px";

    rogue.classList.remove("hit");

    // Breve escudo al arrancar, para que un enemigo no pueda
    // golpear a Rogue antes de que el jugador reaccione.
    invulnerable = true;
    rogue.classList.add("invulnerable");

    setTimeout(function() {
        invulnerable = false;
        rogue.classList.remove("invulnerable");
    }, SPAWN_SHIELD_MS);

    gambit.classList.remove("revealed");

    document.querySelectorAll(".collectible").forEach(function(item) {
        item.dataset.collected = "false";
        item.style.display = "block";
    });

    enemyState.forEach(function(enemy) {
        enemy.x = enemy.startX;
        enemy.y = enemy.startY;

        enemy.el.style.left = enemy.x + "px";
        enemy.el.style.top = enemy.y + "px";
    });
}

// Toda la navegación entre pantallas pasa por showScreen(), que
// solo alterna la clase "active" — así evitamos que un estilo
// inline (display) se quede pisando la clase y bloquee el regreso
// al inicio con "PLAY AGAIN".

startButton.addEventListener("click", function() {
    showScreen(missionScreen);
    resetGame();
    startMusic();
});

document.addEventListener("keydown", function(event) {
    keys[event.key.toLowerCase()] = true;
});

document.addEventListener("keyup", function(event) {
    keys[event.key.toLowerCase()] = false;
});

/* ============================================================
   COLISIÓN CON PAREDES

   Las paredes son estáticas, así que en cada intento de
   movimiento calculamos su rectángulo (relativo al mapa) y lo
   comparamos contra el rectángulo que Rogue ocuparía en la
   nueva posición, antes de mover el sprite en el DOM. Si hay
   choque, ese eje de movimiento se descarta (permitiendo
   "deslizarse" sobre el eje libre).
============================================================ */

function getWallRects() {
    const mapRect = map.getBoundingClientRect();

    return Array.from(walls).map(function(wall) {
        const rect = wall.getBoundingClientRect();

        return {
            left: rect.left - mapRect.left,
            top: rect.top - mapRect.top,
            right: rect.right - mapRect.left,
            bottom: rect.bottom - mapRect.top
        };
    });
}

function getRogueRectAt(x, y) {
    const mapHeight = map.clientHeight;
    const width = rogue.offsetWidth;
    const height = rogue.offsetHeight;

    // "y" está expresado como distancia al borde inferior (bottom),
    // lo convertimos a distancia al borde superior (top) para que
    // coincida con el sistema de coordenadas de getBoundingClientRect.
    const top = mapHeight - y - height;

    return {
        left: x,
        top: top,
        right: x + width,
        bottom: top + height
    };
}

function rectsOverlap(a, b) {
    const margin = 2; // pequeña tolerancia para que el sprite roce el borde sin trabarse

    return (
        a.left < b.right - margin &&
        a.right > b.left + margin &&
        a.top < b.bottom - margin &&
        a.bottom > b.top + margin
    );
}

function hitsWall(x, y) {
    const rogueRect = getRogueRectAt(x, y);
    const wallRects = getWallRects();

    return wallRects.some(function(wallRect) {
        return rectsOverlap(rogueRect, wallRect);
    });
}

function moveRogue() {
    if (!gameStarted) {
        requestAnimationFrame(moveRogue);
        return;
    }

    let newX = roguePosition.x;
    let newY = roguePosition.y;

    if (keys["arrowleft"] || keys["a"]) {
        newX -= speed;
    }

    if (keys["arrowright"] || keys["d"]) {
        newX += speed;
    }

    if (keys["arrowup"] || keys["w"]) {
        newY += speed;
    }

    if (keys["arrowdown"] || keys["s"]) {
        newY -= speed;
    }

    const maxX = map.clientWidth - rogue.offsetWidth;
    const maxY = map.clientHeight - rogue.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    let moved = false;

    // Movimiento en X: si choca con una pared, se ignora ese eje
    if (newX !== roguePosition.x && !hitsWall(newX, roguePosition.y)) {
        roguePosition.x = newX;
        moved = true;
    }

    // Movimiento en Y: se evalúa por separado para permitir deslizarse
    // a lo largo de una pared en vez de quedar trabado
    if (newY !== roguePosition.y && !hitsWall(roguePosition.x, newY)) {
        roguePosition.y = newY;
        moved = true;
    }

    rogue.style.left = roguePosition.x + "px";
    rogue.style.bottom = roguePosition.y + "px";

    if (moved) {
        checkCollectibles();
        checkGambit();
    }

    updateEnemies();
    checkEnemyCollisions();

    requestAnimationFrame(moveRogue);
}

function checkCollectibles() {
    const rogueRect = rogue.getBoundingClientRect();

    document.querySelectorAll(".collectible").forEach(function(item) {
        if (item.dataset.collected === "true") {
            return;
        }

        const itemRect = item.getBoundingClientRect();

        const distanceX = Math.abs(
            rogueRect.left - itemRect.left
        );

        const distanceY = Math.abs(
            rogueRect.top - itemRect.top
        );

        if (distanceX < 35 && distanceY < 35) {
            item.dataset.collected = "true";
            item.style.display = "none";

            if (item.classList.contains("heart")) {
                score += 100;
                gameMessage.textContent = "OH, YOU'RE GETTING CLOSE... +100";
            } else {
                score += 250;
                gameMessage.textContent = "CARD COLLECTED. +250";
            }

            scoreElement.textContent = String(score).padStart(6, "0");
        }
    });
}

/* ============================================================
   ENEMIGOS — movimiento y colisión

   Cada enemigo rebota libremente dentro del mapa. Si toca a
   Rogue (y ella no está en su breve ventana de invulnerabilidad
   tras el último golpe), pierde una vida. Al llegar a 0 vidas,
   se activa el Game Over.
============================================================ */

const HIT_DISTANCE = 34;
const INVULNERABLE_MS = 1000;
const HIT_FLASH_MS = 300;

function updateEnemies() {
    if (missionComplete || isGameOver) {
        return;
    }

    const maxX = map.clientWidth;
    const maxY = map.clientHeight;

    enemyState.forEach(function(enemy) {
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;

        const boundX = maxX - enemy.el.offsetWidth;
        const boundY = maxY - enemy.el.offsetHeight;

        if (enemy.x <= 0 || enemy.x >= boundX) {
            enemy.vx *= -1;
            enemy.x = Math.max(0, Math.min(enemy.x, boundX));
        }

        if (enemy.y <= 0 || enemy.y >= boundY) {
            enemy.vy *= -1;
            enemy.y = Math.max(0, Math.min(enemy.y, boundY));
        }

        enemy.el.style.left = enemy.x + "px";
        enemy.el.style.top = enemy.y + "px";
    });
}

function checkEnemyCollisions() {
    if (missionComplete || isGameOver || invulnerable) {
        return;
    }

    const rogueRect = rogue.getBoundingClientRect();

    const rogueCenterX = rogueRect.left + rogueRect.width / 2;
    const rogueCenterY = rogueRect.top + rogueRect.height / 2;

    enemyState.some(function(enemy) {
        const enemyRect = enemy.el.getBoundingClientRect();

        const enemyCenterX = enemyRect.left + enemyRect.width / 2;
        const enemyCenterY = enemyRect.top + enemyRect.height / 2;

        const distance = Math.hypot(
            rogueCenterX - enemyCenterX,
            rogueCenterY - enemyCenterY
        );

        if (distance < HIT_DISTANCE) {
            handleEnemyHit();
            return true;
        }

        return false;
    });
}

function handleEnemyHit() {
    if (missionComplete) {
        return;
    }

    livesRemaining -= 1;
    updateLivesDisplay();

    invulnerable = true;
    rogue.classList.add("hit");
    rogue.classList.add("invulnerable");

    setTimeout(function() {
        rogue.classList.remove("hit");
    }, HIT_FLASH_MS);

    setTimeout(function() {
        rogue.classList.remove("invulnerable");
        invulnerable = false;
    }, INVULNERABLE_MS);

    if (livesRemaining <= 0) {
        triggerGameOver();
    } else {
        gameMessage.textContent = "OUCH! ROGUE TOOK A HIT.";
    }
}

function triggerGameOver() {
    isGameOver = true;
    gameStarted = false;

    gameMessage.textContent = "ROGUE IS DOWN...";

    setTimeout(function() {
        // Si mientras tanto la misión se completó (encontró a
        // Gambit), esa pantalla tiene prioridad: no la pisamos.
        if (!missionComplete) {
            showScreen(gameoverScreen);
        }
    }, 800);
}

/* ============================================================
   GAMBIT ESCONDIDO

   Gambit empieza casi invisible (ver .character-sprite en
   style.css). A medida que Rogue se acerca dentro de
   REVEAL_DISTANCE, gana la clase "revealed" y se desvanece
   hacia su apariencia normal. Solo al llegar a CATCH_DISTANCE
   se completa la misión.
============================================================ */

const REVEAL_DISTANCE = 160;
const CATCH_DISTANCE = 55;

function checkGambit() {
    if (missionComplete) {
        return;
    }

    const rogueRect = rogue.getBoundingClientRect();
    const gambitRect = gambit.getBoundingClientRect();

    const rogueCenterX = rogueRect.left + rogueRect.width / 2;
    const rogueCenterY = rogueRect.top + rogueRect.height / 2;

    const gambitCenterX = gambitRect.left + gambitRect.width / 2;
    const gambitCenterY = gambitRect.top + gambitRect.height / 2;

    const distance = Math.hypot(
        rogueCenterX - gambitCenterX,
        rogueCenterY - gambitCenterY
    );

    if (distance < REVEAL_DISTANCE) {
        gambit.classList.add("revealed");

        if (!gambitSpotted) {
            gambitSpotted = true;
            gameMessage.textContent = "YOU SENSE SOMEONE NEARBY...";
        }
    } else {
        gambit.classList.remove("revealed");
    }

    if (distance < CATCH_DISTANCE) {
        completeMission();
    }
}

function completeMission() {
    if (isGameOver) {
        return;
    }

    missionComplete = true;

    gambit.classList.add("revealed");

    score += 1000;

    scoreElement.textContent = String(score).padStart(6, "0");

    missionStatus.textContent = "MISSION COMPLETE";
    gameMessage.textContent = "GAMBIT FOUND. OBJECTIVE COMPLETE.";

    setTimeout(function() {
        startGambitScene();
    }, 1500);
}

function startGambitScene() {
    showScreen(gambitScreen);

    dialogueIndex = 0;

    dialogueText.textContent = dialogueLines[dialogueIndex];
}

dialogueNext.addEventListener("click", function() {
    dialogueIndex++;

    if (dialogueIndex < dialogueLines.length) {
        dialogueText.textContent = dialogueLines[dialogueIndex];
    } else {
        showScreen(proposalScreen);
    }
});

yesButton.addEventListener("click", function() {
    document.getElementById("ending-icon").textContent = "♥";

    document.getElementById("ending-title").textContent =
        "MISSION COMPLETE";

    document.getElementById("ending-text").textContent =
        "YOU CHOSE GAMBIT. HE KNEW YOU WOULD.";

    showScreen(endingScreen);
});

noButton.addEventListener("click", function() {
    document.getElementById("ending-icon").textContent = "♦";

    document.getElementById("ending-title").textContent =
        "MISSION... FAILED?";

    document.getElementById("ending-text").textContent =
        "GAMBIT MAY TRY TO WIN YOUR HEART AGAIN.";

    showScreen(endingScreen);
});

restartButton.addEventListener("click", function() {
    gameStarted = false;
    showScreen(startScreen);
});

gameoverRestartButton.addEventListener("click", function() {
    gameStarted = false;
    isGameOver = false;
    showScreen(startScreen);
});

moveRogue();
