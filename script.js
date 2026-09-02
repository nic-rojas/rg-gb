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
    { x: 360, y: 190 },
    { x: 140, y: 300 },
    { x: 600, y: 140 }
];

const enemyDirections = [
    { vx: 1.8, vy: -1.3 },
    { vx: -1.6, vy: 1.4 },
    { vx: 1.4, vy: 1.6 }
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
    invulnerable = false;
    livesRemaining = MAX_LIVES;

    scoreElement.textContent = "000000";
    missionStatus.textContent = "FIND GAMBIT";
    gameMessage.textContent = "FIND GAMBIT. HE IS SOMEWHERE IN THE CITY...";

    updateLivesDisplay();

    roguePosition.x = 35;
    roguePosition.y = 35;

    rogue.style.left = roguePosition.x + "px";
    rogue.style.bottom = roguePosition.y + "px";

    rogue.classList.remove("hit", "invulnerable");

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
                gameMessage.textContent = "HEART COLLECTED. +100";
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
        showScreen(gameoverScreen);
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