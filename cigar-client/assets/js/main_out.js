(function(wHandle, wjQuery) {
    /*global navigator, Image, $*/
    var CONNECTION_URL = ""; // Default to window.location.host
    var SKIN_URL = "./skins/"; // Skins Directory

    // --- Blobs Audio Sound System (Web Audio API - Zero latency, pure synth) ---
    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    wHandle.soundVolume = 1.0;
    wHandle.setSoundVolume = function(vol) {
        wHandle.soundVolume = Math.max(0, Math.min(1, vol));
    };

    wHandle.playGameSound = function(type) {
        if (wHandle.soundVolume <= 0) return;
        var ctx = getAudioCtx();
        if (!ctx) return;
        var now = ctx.currentTime;
        var masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(wHandle.soundVolume, now);
        masterGain.connect(ctx.destination);

        if (type === 'start') {
            // Uplifting, crisp spawn chime
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);
            osc.frequency.exponentialRampToValueAtTime(820, now + 0.35);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'death') {
            // Authentic Agar/Blobz "Swallowed Pop" - Organic juicy pop & soft crunch
            var osc = ctx.createOscillator();
            var oscLow = ctx.createOscillator();
            var gain = ctx.createGain();
            var gainLow = ctx.createGain();

            osc.type = 'sine';
            oscLow.type = 'sine';

            // High-to-mid liquid pop pitch contour
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

            // Subtle sub resonance
            oscLow.frequency.setValueAtTime(140, now);
            oscLow.frequency.exponentialRampToValueAtTime(50, now + 0.18);

            gain.gain.setValueAtTime(0.38, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

            gainLow.gain.setValueAtTime(0.25, now);
            gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            osc.connect(gain);
            gain.connect(masterGain);

            oscLow.connect(gainLow);
            gainLow.connect(masterGain);

            osc.start(now);
            oscLow.start(now);
            osc.stop(now + 0.15);
            oscLow.stop(now + 0.20);
        } else if (type === 'virus') {
            // Sharp shattering noise burst + pop
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(420, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);
            gain.gain.setValueAtTime(0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            // Add short noise pop
            var bufferSize = ctx.sampleRate * 0.15;
            var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
            }
            var noise = ctx.createBufferSource();
            noise.buffer = buffer;
            var noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.35, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            noise.connect(noiseGain);
            noiseGain.connect(masterGain);
            noise.start(now);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.26);
        } else if (type === 'chat') {
            // Modern, soft pop / subtle message chime (Discord / iOS style bubble pop)
            var osc1 = ctx.createOscillator();
            var osc2 = ctx.createOscillator();
            var gain1 = ctx.createGain();
            var gain2 = ctx.createGain();

            osc1.type = 'sine';
            osc2.type = 'sine';

            // High soft dual-tone bubble
            osc1.frequency.setValueAtTime(523.25, now); // C5
            osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.04); // E5

            osc2.frequency.setValueAtTime(783.99, now + 0.04); // G5
            osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.09); // C6

            gain1.gain.setValueAtTime(0.18, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            gain2.gain.setValueAtTime(0.001, now);
            gain2.gain.setValueAtTime(0.15, now + 0.04);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc1.connect(gain1);
            gain1.connect(masterGain);

            osc2.connect(gain2);
            gain2.connect(masterGain);

            osc1.start(now);
            osc1.stop(now + 0.07);

            osc2.start(now + 0.04);
            osc2.stop(now + 0.13);
        }
    };
    wHandle.setServer = function(arg) {
        if (arg != gameMode) {
            CONNECTION_URL = arg;
            gameMode = arg;
            showConnecting();
        }
    };
    wHandle.spawnBots = function(count, mass) {
        if (!ws || ws.readyState !== 1) return;
        var currentNick = userNickName || ($("#nick").val() || "").trim() || "Blobz Player";
        if (!userNickName) {
            userNickName = currentNick;
            sendNickName();
        }
        var msg = prepareData(5);
        msg.setUint8(0, 30);
        msg.setUint16(1, count || 10, true);
        msg.setUint16(3, 10, true);
        wsSend(msg);
    };
    wHandle.stopBots = function() {
        if (!ws || ws.readyState !== 1) return;
        var msg = prepareData(1);
        msg.setUint8(0, 31);
        wsSend(msg);
    };
    wHandle.splitBots = function() {
        if (!ws || ws.readyState !== 1) return;
        sendUint8(22);
    };
    wHandle.feedBots = function() {
        if (!ws || ws.readyState !== 1) return;
        sendUint8(23);
    };
    wHandle.customPlayerSkinImg = null;
    wHandle.userSkinsCache = {};
    wHandle.getUserSkinImage = function(rawName) {
        if (!rawName) return null;
        var name = rawName.trim();
        if (!name) return null;
        var lower = name.toLowerCase();
        if (wHandle.userSkinsCache[lower] !== undefined) {
            return wHandle.userSkinsCache[lower];
        }
        var skinSrc = null;
        try {
            var accounts = JSON.parse(localStorage.getItem('blobz_accounts') || '{}');
            for (var acc in accounts) {
                if (acc.toLowerCase() === lower && accounts[acc].skin) {
                    skinSrc = accounts[acc].skin;
                    break;
                }
            }
            if (!skinSrc) {
                skinSrc = localStorage.getItem('blobz_skin_' + name);
            }
        } catch(e){}

        var img = new Image();
        img.onload = function() {
            wHandle.userSkinsCache[lower] = img;
        };
        img.onerror = function() {
            wHandle.userSkinsCache[lower] = null;
        };

        if (skinSrc) {
            img.src = skinSrc;
            wHandle.userSkinsCache[lower] = img;
            return img;
        }

        // If not in local storage (e.g. guest or other browser), load from server
        var safeUser = lower.replace(/[^a-z0-9_-]/gi, '');
        if (safeUser) {
            img.src = '/skins/users/' + safeUser + '.png';
            wHandle.userSkinsCache[lower] = img;
            return img;
        }

        wHandle.userSkinsCache[lower] = null;
        return null;
    };
    wHandle.setCustomSkin = function(src) {
        if (!src) {
            wHandle.customPlayerSkinImg = null;
            try { localStorage.removeItem('blobz_custom_skin'); } catch(e){}
            return;
        }
        try { localStorage.setItem('blobz_custom_skin', src); } catch(e){}
        var img = new Image();
        img.onload = function() {
            wHandle.customPlayerSkinImg = img;
        };
        img.src = src;
        wHandle.customPlayerSkinImg = img;
    };
    try {
        var _savedSkin = localStorage.getItem('blobz_custom_skin');
        if (_savedSkin) wHandle.setCustomSkin(_savedSkin);
    } catch(e){}
    wHandle.useBlobsSkin = true; // Enabled by default
    try {
        var _savedBlobsSkin = localStorage.getItem('blobz_use_blobs_skin');
        if (_savedBlobsSkin !== null) {
            wHandle.useBlobsSkin = (_savedBlobsSkin === 'true');
        }
    } catch(e){}
    wHandle.setUseBlobsSkin = function(val) {
        wHandle.useBlobsSkin = !!val;
        try { localStorage.setItem('blobz_use_blobs_skin', wHandle.useBlobsSkin); } catch(e){}
    };

    function drawBlobsSkin(ctx, x, y, size, color, text) {
        var R = size;
        if (R < 3) return;
        var skinCol = color || "#0022cc";

        // 1. Outer colored ring - sleek authentic thickness
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2, false);
        ctx.fill();

        // 2. White spacer ring - wide gauge ring
        var r_outer_white = R * 0.935;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, r_outer_white, 0, Math.PI * 2, false);
        ctx.fill();

        // 3. Inner colored circle (offset down slightly for authentic gauge look)
        var cy_inner = y + R * 0.05;
        var r_inner = R * 0.69;
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        ctx.arc(x, cy_inner, r_inner, 0, Math.PI * 2, false);
        ctx.fill();

        // 4. Three slender gauge ticks at top right
        var tick_angles = [-74, -58, -42];
        var half_w = 1.8 * Math.PI / 180;
        ctx.fillStyle = skinCol;
        for (var i = 0; i < tick_angles.length; i++) {
            var aRad = tick_angles[i] * Math.PI / 180;
            var a1 = aRad - half_w;
            var a2 = aRad + half_w;
            ctx.beginPath();
            ctx.moveTo(x + (r_inner - 1) * Math.cos(a1), cy_inner + (r_inner - 1) * Math.sin(a1));
            ctx.lineTo(x + (r_outer_white + 1) * Math.cos(a1), y + (r_outer_white + 1) * Math.sin(a1));
            ctx.lineTo(x + (r_outer_white + 1) * Math.cos(a2), y + (r_outer_white + 1) * Math.sin(a2));
            ctx.lineTo(x + (r_inner - 1) * Math.cos(a2), cy_inner + (r_inner - 1) * Math.sin(a2));
            ctx.closePath();
            ctx.fill();
        }

        // 5. Crisp Player tag/name in center (e.g. Blobs#3928) with subtle dark stroke for pop
        var dispText = (text || "").trim();
        if (dispText && R >= 13) {
            var maxW = r_inner * 1.7;
            var fontSize = Math.max(9, ~~(R * 0.25));
            ctx.font = "bold " + fontSize + "px 'Ubuntu', 'Segoe UI', Arial, sans-serif";
            var m = ctx.measureText(dispText);
            if (m.width > maxW) {
                fontSize = Math.max(8, ~~(fontSize * (maxW / m.width)));
                ctx.font = "bold " + fontSize + "px 'Ubuntu', 'Segoe UI', Arial, sans-serif";
            }
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = Math.max(2, ~~(fontSize * 0.14));
            ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
            ctx.strokeText(dispText, x, cy_inner - 1);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(dispText, x, cy_inner - 1);
        }
    }

    wHandle.freezeBots = function() {
        if (!ws || ws.readyState !== 1) return;
        sendUint8(24);
    };
    var touchable = 'createTouch' in document,
        touches = [],
        leftTouchID = -1,
        leftTouchPos = {x: 0, y: 0},
        leftTouchStartPos = {x: 0, y: 0},
        leftVector = {x: 0, y: 0},
        useHttps = "https:" == wHandle.location.protocol;
    function gameLoop() {
        connecting = 1;
        document.getElementById("canvas").focus();
        var isTyping = 0,
            chattxt;
        mainCanvas = nCanvas = document.getElementById("canvas");
        ctx = mainCanvas.getContext("2d");
        mainCanvas.onmousemove = function(event) {
            rawMouseX = event.clientX;
            rawMouseY = event.clientY;
            mouseCoordChange();
            sendMouseMove();
        };
        if (touchable) {
            mainCanvas.addEventListener('touchstart', onTouchStart, 0);
            mainCanvas.addEventListener('touchmove', onTouchMove, 0);
            mainCanvas.addEventListener('touchend', onTouchEnd, 0);
        }
        mainCanvas.onmouseup = function() {};
        if (/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll", handleWheel, 0);
        } else {
            document.body.onmousewheel = handleWheel;
        }
        mainCanvas.onfocus = function() {
            isTyping = 0;
        };
        var chatInputEl = document.getElementById("chat_textbox");
        if (chatInputEl) {
            chatInputEl.onblur = function() {
                isTyping = 0;
            };
            chatInputEl.onfocus = function() {
                isTyping = 1;
            };
            chatInputEl.onkeydown = function(e) {
                if (e.keyCode === 13) {
                    var text = chatInputEl.value;
                    if (text && text.trim().length > 0) {
                        sendChat(text.trim());
                    }
                    chatInputEl.value = "";
                    chatInputEl.blur();
                    if (mainCanvas) mainCanvas.focus();
                    e.stopPropagation();
                }
            };
        }
        var spacePressed = 0,
            qPressed = 0,
            ePressed = 0,
            rPressed = 0,
            tPressed = 0,
            wPressed = 0,
            pPressed = 0,
            oPressed = 0,
            mPressed = 0,
            yPressed = 0,
            uPressed = 0,
            kPressed = 0,
            iPressed = 0,
            lPressed = 0,
            hPressed = 0,
            zPressed = 0,
            xPressed = 0,
            sPressed = 0,
            cPressed = 0,
            gPressed = 0,
            jPressed = 0,
            bPressed = 0,
            vPressed = 0,
            nPressed = 0,
            wInterval = null,
            rInterval = null;
        wHandle.onkeydown = function(event) {
            if (hasOverlay) return;
            switch (event.keyCode) {
                case 32: // SPACE key
                    if (!spacePressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(17);
                        spacePressed = 1;
                    }
                    break;
                case 81: // Q key
                    if (!qPressed && !isTyping && !hasOverlay) {
                        sendUint8(18);
                        qPressed = 1;
                        if (wHandle.isSpectating) {
                            wHandle.isFreeRoam = !wHandle.isFreeRoam;
                        }
                    }
                    break;
                case 87: // W key (Macro Eject 80ms)
                    if (!isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(21);
                        if (!wPressed) {
                            wPressed = 1;
                            if (wInterval) clearInterval(wInterval);
                            wInterval = setInterval(function() {
                                if (wPressed && !hasOverlay) {
                                    sendMouseMove();
                                    sendUint8(21);
                                } else {
                                    clearInterval(wInterval);
                                    wInterval = null;
                                }
                            }, 80);
                        }
                    }
                    break;
                case 69: // E key
                    if (!ePressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(22);
                    }
                    break;
                case 82: // R key (Minion Macro Feed 80ms)
                    if (!isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(23);
                        if (!rPressed) {
                            rPressed = 1;
                            if (rInterval) clearInterval(rInterval);
                            rInterval = setInterval(function() {
                                if (rPressed && !hasOverlay) {
                                    sendMouseMove();
                                    sendUint8(23);
                                } else {
                                    clearInterval(rInterval);
                                    rInterval = null;
                                }
                            }, 80);
                        }
                    }
                    break;
                case 84: // T key
                    if (!tPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(24);
                        tPressed = 1;
                    }
                    break;
                case 80: // P key
                    if (!pPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(25);
                        pPressed = 1;
                    }
                    break;
                case 73: // I key
                    if (!iPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(28);
                        iPressed = 1;
                    }
                    break;
                case 89: // Y key
                    if (!yPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(30);
                    }
                    break;
                case 85: // U key
                    if (!uPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(31);
                    }
                    break;
                case 75: // K key
                    if (!kPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(29);
                        kPressed = 1;
                    }
                    break;
                case 76: // L key
                    if (!lPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(33);
                        lPressed = 1;
                    }
                    break;
                case 72: // H key
                    if (!hPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(34);
                        hPressed = 1;
                    }
                    break;
                case 90: // Z key
                    if (!zPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(35);
                    }
                    break;
                case 88: // X key
                    if (!xPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(36);
                        xPressed = 1;
                    }
                    break;
                case 83: // S key
                    if (!sPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(37);
                    }
                    break;
                case 67: // C key
                    if (!cPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(38);
                        cPressed = 1;
                    }
                    break;
                case 71: // J key
                    if (!jPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(39);
                    }
                    break;
                case 74: // G key
                    if (!gPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(40);
                    }
                    break;
                case 66: // B key
                    if (!bPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(41);
                        bPressed = 1;
                    }
                    break;
                case 86: // V key
                    if (!vPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(42);
                        vPressed = 1;
                    }
                    break;
                case 78: // N key
                    if (!nPressed && !isTyping && !hasOverlay) {
                        sendMouseMove();
                        sendUint8(43);
                    }
                    break;
                case 13: // ENTER key
                    if (chatInputEl && chatInputEl.readOnly) {
                        break; // Guests cannot open chat input
                    }
                    if (isTyping || hideChat) {
                        isTyping = 0;
                        if (chatInputEl) {
                            chattxt = chatInputEl.value;
                            if (chattxt.length > 0) sendChat(chattxt);
                            chatInputEl.value = "";
                            chatInputEl.blur();
                        }
                        if (mainCanvas) mainCanvas.focus();
                    } else {
                        if (!hasOverlay && chatInputEl) {
                            chatInputEl.focus();
                            isTyping = 1;
                        }
                    }
                    break;
                case 27: // ESC key
                    showOverlays(1);
                    wHandle.isSpectating = 0;
                    break;
            }
        };
        wHandle.onkeyup = function(event) {
            switch (event.keyCode) {
                case 32:
                    spacePressed = 0;
                    break;
                case 87:
                    wPressed = 0;
                    if (wInterval) {
                        clearInterval(wInterval);
                        wInterval = null;
                    }
                    break;
                case 69:
                    ePressed = 0;
                    break;
                case 82:
                    rPressed = 0;
                    if (rInterval) {
                        clearInterval(rInterval);
                        rInterval = null;
                    }
                    break;
                case 84:
                    tPressed = 0;
                    break;
                case 80:
                    pPressed = 0;
                    break;
                case 73:
                    iPressed = 0;
                    break;
                case 89:
                    yPressed = 0;
                    break;
                case 85:
                    uPressed = 0;
                    break;
                case 75:
                    kPressed = 0;
                    break;
                case 76:
                    lPressed = 0;
                    break;
                case 72:
                    hPressed = 0;
                    break;
                case 90:
                    zPressed = 0;
                    break;
                case 88:
                    xPressed = 0;
                    break;
                case 83:
                    sPressed = 0;
                    break;
                case 67:
                    cPressed = 0;
                    break;
                case 74:
                    gPressed = 0;
                    break;
                case 71:
                    jPressed = 0;
                    break;
                case 66:
                    bPressed = 0;
                    break;
                case 86:
                    vPressed = 0;
                    break;
                case 78:
                    nPressed = 0;
                    break;
                case 81:
                    if (qPressed) {
                        sendUint8(19);
                        qPressed = 0;
                    }
                    break;
            }
        };
        wHandle.onblur = function() {
            sendUint8(19);
            spacePressed = 0;
            qPressed = 0;
            ePressed = 0;
            rPressed = 0;
            tPressed = 0;
            wPressed = 0;
            if (wInterval) { clearInterval(wInterval); wInterval = null; }
            if (rInterval) { clearInterval(rInterval); rInterval = null; }
            pPressed = 0;
            oPressed = 0;
            mPressed = 0;
            yPressed = 0;
            uPressed = 0;
            kPressed = 0;
            iPressed = 0;
            lPressed = 0;
            hPressed = 0;
            zPressed = 0;
            xPressed = 0;
            sPressed = 0;
            cPressed = 0;
            gPressed = 0;
            jPressed = 0;
            bPressed = 0;
            vPressed = 0;
            nPressed = 0;
        };
        canvasResize();
        var smoothAnimFrame = (wHandle.requestAnimationFrame || wHandle.webkitRequestAnimationFrame || wHandle.mozRequestAnimationFrame || wHandle.msRequestAnimationFrame || function(fn) { setTimeout(fn, 1000 / 60); }).bind(wHandle);
        function renderLoop() {
            drawScene();
            smoothAnimFrame(renderLoop);
        }
        smoothAnimFrame(renderLoop);
        setInterval(sendMouseMove, 40);
        null == ws && showConnecting();
        wjQuery("#overlays").show();
    }
    function onTouchStart(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if ((leftTouchID < 0) && (touch.clientX < canvasWidth / 2)) {
                leftTouchID = touch.identifier;
                leftTouchStartPos.reset(touch.clientX, touch.clientY);
                leftTouchPos.copyFrom(leftTouchStartPos);
                leftVector.reset(0, 0);
            }
            var size = ~~(canvasWidth / 7);
            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - size)) {
                sendMouseMove();
                sendUint8(17); //split
            }
            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - 2 * size - 10) && (touch.clientY < canvasHeight - size - 10)) {
                sendMouseMove();
                sendUint8(21); //eject
            }
        }
        touches = e.touches;
    }
    function onTouchMove(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if (leftTouchID == touch.identifier) {
                leftTouchPos.reset(touch.clientX, touch.clientY);
                leftVector.copyFrom(leftTouchPos);
                leftVector.minusEq(leftTouchStartPos);
                rawMouseX = leftVector.x * 3 + canvasWidth / 2;
                rawMouseY = leftVector.y * 3 + canvasHeight / 2;
                mouseCoordChange();
                sendMouseMove();
            }
        }
        touches = e.touches;
    }
    function onTouchEnd(e) {
        touches = e.touches;
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if (leftTouchID == touch.identifier) {
                leftTouchID = -1;
                leftVector.reset(0, 0);
                break;
            }
        }
    }
    function handleWheel(event) {
        zoom *= Math.pow(.9, event.wheelDelta / -120 || event.detail || 0);
        // Generous zoom-out boundary
        if (zoom < 0.20) zoom = 0.20;
        if (zoom > 2.2) zoom = 2.2;
    }
    function buildQTree() {
        if (.4 > viewZoom) qTree = null;
        else {
            var a = Number.POSITIVE_INFINITY,
                b = Number.POSITIVE_INFINITY,
                c = Number.NEGATIVE_INFINITY,
                d = Number.NEGATIVE_INFINITY,
                e = 0;
            for (var i = 0; i < nodelist.length; i++) {
                var node = nodelist[i];
                if (node.shouldRender() && !node.prepareData && 20 < node.size * viewZoom) {
                    e = Math.max(node.size, e);
                    a = Math.min(node.x, a);
                    b = Math.min(node.y, b);
                    c = Math.max(node.x, c);
                    d = Math.max(node.y, d);
                }
            }
            qTree = Quad.init({
                minX: a - (e + 100),
                minY: b - (e + 100),
                maxX: c + (e + 100),
                maxY: d + (e + 100),
                maxChildren: 2,
                maxDepth: 4
            });
            for (i = 0; i < nodelist.length; i++) {
                node = nodelist[i];
                if (node.shouldRender() && !(20 >= node.size * viewZoom)) {
                    for (a = 0; a < node.points.length; ++a) {
                        b = node.points[a].x;
                        c = node.points[a].y;
                        b < nodeX - canvasWidth / 2 / viewZoom || c < nodeY - canvasHeight / 2 / viewZoom || b > nodeX + canvasWidth / 2 / viewZoom || c > nodeY + canvasHeight / 2 / viewZoom || qTree.insert(node.points[a]);
                    }
                }
            }
        }
    }
    function mouseCoordChange() {
        X = (rawMouseX - canvasWidth / 2) / viewZoom + nodeX;
        Y = (rawMouseY - canvasHeight / 2) / viewZoom + nodeY;
    }
    function hideOverlays() {
        hasOverlay = 0;
        wjQuery("#adsBottom").hide();
        wjQuery("#overlays").hide();
    }
    function showOverlays(arg) {
        hasOverlay = 1;
        userNickName = null;
        if (arg) {
            wjQuery("#overlays").fadeIn(250);
        } else {
            setTimeout(function() {
                if (hasOverlay) {
                    wjQuery("#overlays").fadeIn(350);
                }
            }, 500);
        }
    }
    function showConnecting() {
        if (!connecting) return;
        wjQuery("#connecting").show();
        wjQuery("#blobs-loading-dots").show();
        var protocol = (location.protocol === "https:") ? "wss://" : "ws://";
        wsConnect(protocol + (CONNECTION_URL || location.host));
    }
    function wsConnect(wsUrl) {
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            try {
                ws.close();
            } catch (b) {}
            ws = null;
        }
        var protocol = (location.protocol === "https:") ? "wss://" : "ws://";
        if (!wsUrl || (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://"))) {
            wsUrl = protocol + (CONNECTION_URL || location.host);
        }
        nodesOnScreen = [];
        playerCells = [];
        nodes = {};
        nodelist = [];
        Cells = [];
        leaderBoard = [];
        mainCanvas = teamScores = null;
        userScore = 0;
        console.log("Connecting to " + wsUrl);
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = onWsOpen;
        ws.onmessage = onWsMSG;
        ws.onclose = onWsClose;
    }
    function prepareData(a) {
        return new DataView(new ArrayBuffer(a));
    }
    function wsSend(a) {
        ws.send(a.buffer);
    }
    function onWsOpen() {
        var msg;
        console.log("Socket open");
        delay = 500;
        wjQuery("#connecting").hide();
        wjQuery("#blobs-loading-dots").fadeOut(200);
        msg = prepareData(5);
        msg.setUint8(0, 254);
        msg.setUint32(1, 5, 1); // Protcol 5
        wsSend(msg);
        msg = prepareData(5);
        msg.setUint8(0, 255);
        msg.setUint32(1, 1332175218, 1);
        wsSend(msg);
        sendNickName();
    }
    function onWsClose() {
        setTimeout(showConnecting, delay);
        console.log("Socket closed");
        delay *= 1.5;
    }
    function onWsMSG(msg) {
        handleWsMSG(new DataView(msg.data));
    }
    function handleWsMSG(msg) {
        function getString() {
            var text = '',
                char;
            while ((char = msg.getUint16(offset, 1)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }
        var offset = 0,
            setCustomLB = 0;
        240 == msg.getUint8(offset) && (offset += 5);
        switch (msg.getUint8(offset++)) {
            case 16: // update nodes
                updateNodes(msg, offset);
                break;
            case 17: // update position
                posX = msg.getFloat32(offset, 1);
                offset += 4;
                posY = msg.getFloat32(offset, 1);
                offset += 4;
                posSize = msg.getFloat32(offset, 1);
                offset += 4;
                if (wHandle.isSpectating && wHandle.firstSpecFrame) {
                    nodeX = posX;
                    nodeY = posY;
                    viewZoom = (posSize || 1) * viewRange();
                    wHandle.firstSpecFrame = 0;
                }
                break;
            case 20: // clear nodes
                playerCells = [];
                nodesOnScreen = [];
                nodes = {};
                nodelist = [];
                break;
            case 21: // draw line
                lineX = msg.getInt16(offset, 1);
                offset += 2;
                lineY = msg.getInt16(offset, 1);
                offset += 2;
                if (!drawLine) {
                    drawLine = 1;
                    drawLineX = lineX;
                    drawLineY = lineY;
                }
                break;
            case 32: // add node
                nodesOnScreen.push(msg.getUint32(offset, 1));
                offset += 4;
                break;
            case 48: // update leaderboard (custom text)
                setCustomLB = 1;
                noRanking = 1;
                break;
            case 49: // update leaderboard (ffa)
                if (!setCustomLB) {
                    noRanking = 0;
                }
                teamScores = null;
                var LBplayerNum = msg.getUint32(offset, 1);
                offset += 4;
                leaderBoard = [];
                for (i = 0; i < LBplayerNum; ++i) {
                    var nodeId = msg.getUint32(offset, 1);
                    offset += 4;
                    leaderBoard.push({
                        id: nodeId,
                        name: getString()
                    });
                }
                wHandle.currentLeaderboard = leaderBoard;
                if (typeof wHandle.updateLeaderboardModalTab === 'function') {
                    wHandle.updateLeaderboardModalTab();
                }
                drawLB();
                break;
            case 50: // update leaderboard (teams)
                teamScores = [];
                var LBteamNum = msg.getUint32(offset, 1);
                offset += 4;
                for (var i = 0; i < LBteamNum; ++i) {
                    teamScores.push(msg.getFloat32(offset, 1));
                    offset += 4;
                }
                drawLB();
                break;
            case 64: // set border
                leftPos = msg.getFloat64(offset, 1);
                offset += 8;
                topPos = msg.getFloat64(offset, 1);
                offset += 8;
                rightPos = msg.getFloat64(offset, 1);
                offset += 8;
                bottomPos = msg.getFloat64(offset, 1);
                offset += 8;
                minX = leftPos;
                minY = topPos;
                maxX = rightPos;
                maxY = bottomPos;
                if (0 == playerCells.length && !hasSpawnedOnce && !wHandle.isSpectating) {
                    posX = (rightPos + leftPos) / 2;
                    posY = (bottomPos + topPos) / 2;
                    posSize = 1;
                    nodeX = posX;
                    nodeY = posY;
                    viewZoom = posSize;
                }
                break;
            case 88: // Server Stats: [88, currentPlayers: uint16, maxPlayers: uint16]
                var currPlayers = msg.getUint16(offset, 1);
                offset += 2;
                var maxPlayers = msg.getUint16(offset, 1);
                offset += 2;
                if (typeof wHandle.updateServerPlayerCount === 'function') {
                    wHandle.updateServerPlayerCount(currPlayers, maxPlayers);
                }
                break;
            case 99:
                addChat(msg, offset);
                break;
        }
    }
    function addChat(view, offset) {
        function getString() {
            var text = '',
                char;
            while ((char = view.getUint16(offset, 1)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }
        var flags = view.getUint8(offset++);
        // for future expansions
        if (flags & 2) offset += 4;
        if (flags & 4) offset += 8;
        if (flags & 8) offset += 16;
        var r = view.getUint8(offset++),
            g = view.getUint8(offset++),
            b = view.getUint8(offset++),
            color = (r << 16 | g << 8 | b).toString(16);
        while (color.length < 6) {
            color = '0' + color;
        }
        color = '#' + color;
        chatBoard.push({
            "name": getString(),
            "color": color,
            "message": getString(),
            "time": Date.now()
        });
        if (typeof wHandle.playGameSound === 'function') {
            wHandle.playGameSound('chat');
        }
        drawChatBoard();
    }
    function drawChatBoard() {
        chatCanvas = document.createElement("canvas");
        var ctx = chatCanvas.getContext("2d");
        var scaleFactor = Math.min(Math.max(canvasWidth / 1200, .75), 1); // Scale factor = .75 to 1
        chatCanvas.width = 1000 * scaleFactor;
        chatCanvas.height = 550 * scaleFactor;
        ctx.scale(scaleFactor, scaleFactor);
        ctx.globalAlpha = .8;
        var len = chatBoard.length;
        var from = len - 10; // Max amount of lines to display on a chat board
        if (from < 0) from = 0;
        for (var i = 0; i < (len - from); i++) {
            var item = chatBoard[i + from];
            var isUserAdmin = (item.name && item.name.trim().toLowerCase() === 'reigns') || (item.name && item.name.indexOf('[Admin]') !== -1);
            var cleanName = (item.name || '').replace('[Admin]', '').trim();

            var currentX = 10;
            var yPos = chatCanvas.height / scaleFactor - 26 * (len - i - from);

            // If user is Admin (Reigns), render the red [Admin] badge with black outline first
            if (isUserAdmin) {
                var adminTag = new UText(18, '#FF1E27', 1, '#000000');
                adminTag.setValue('[Admin] ');
                var adminRender = adminTag.render();
                var adminWidth = adminTag.getWidth();
                ctx.drawImage(adminRender, currentX, yPos);
                currentX += adminWidth + 2;
            }

            // Name: Electric vibrant color / skin color with dark outline
            var chatName = new UText(18, isUserAdmin ? '#FF3344' : (item.color || '#2563eb'), 1, '#000000');
            chatName.setValue(cleanName + ' :');
            var nameRender = chatName.render();
            var nameWidth = chatName.getWidth();
            ctx.drawImage(nameRender, currentX, yPos);
            currentX += nameWidth;

            // Message: Crisp dark text (#1e293b) with white stroke for maximum contrast
            var chatText = new UText(18, isUserAdmin ? '#0f172a' : '#1e293b', 1, '#ffffff');
            chatText.setValue(item.message);
            var textRender = chatText.render();

            // Column spacing: ensure message never overlaps name, with clean separation
            var messageX = Math.max(currentX + 12, 170);
            ctx.drawImage(textRender, messageX, yPos);
        }
    }
    function updateNodes(view, offset) {
        timestamp = +new Date();
        var code = Math.random();
        ua = 0;
        var queueLength = view.getUint16(offset, 1);
        offset += 2;
        for (i = 0; i < queueLength; ++i) {
            var killerId = view.getUint32(offset, 1);
            var killedId = view.getUint32(offset + 4, 1);
            offset += 8;
            var killer = nodes[killerId];
            var killedNode = nodes[killedId];
            if (killedNode) {
                var wasPlayerCell = (-1 != playerCells.indexOf(killedNode));
                killedNode.destroy();
                if (killer && (killedNode.size > 22 || killedNode.name || killedNode.isVirus)) {
                    killedNode.ox = killedNode.x;
                    killedNode.oy = killedNode.y;
                    killedNode.oSize = killedNode.size;
                    killedNode.nx = killer.x;
                    killedNode.ny = killer.y;
                    killedNode.nSize = killedNode.size;
                    killedNode.updateTime = timestamp;
                }
                if (wasPlayerCell) {
                    posX = killedNode.x;
                    posY = killedNode.y;
                }
            }
        }
        for (var i = 0;;) {
            var nodeid = view.getUint32(offset, 1);
            offset += 4;
            if (0 == nodeid) break;
            ++i;
            var size, posY, posX = view.getInt32(offset, 1);
            offset += 4;
            posY = view.getInt32(offset, 1);
            offset += 4;
            size = view.getInt16(offset, 1);
            offset += 2;
            for (var r = view.getUint8(offset++), g = view.getUint8(offset++), b = view.getUint8(offset++),
                color = (r << 16 | g << 8 | b).toString(16); 6 > color.length;) color = "0" + color;
            var colorstr = "#" + color,
                flags = view.getUint8(offset++),
                flagVirus = !!(flags & 1),
                flagAgitated = !!(flags & 16),
                _skin = "";
            flags & 2 && (offset += 4);
            if (flags & 4) {
                for (;;) { // Skin name
                    var t = view.getUint8(offset, 1) & 0x7F;
                    offset += 1;
                    if (0 == t) break;
                    _skin += String.fromCharCode(t);
                }
            }
            for (var char, name = "";;) { // Nick name
                char = view.getUint16(offset, 1);
                offset += 2;
                if (0 == char) break;
                name += String.fromCharCode(char);
            }
            var node = null;
            if (nodes.hasOwnProperty(nodeid)) {
                node = nodes[nodeid];
                node.updatePos();
                node.ox = node.x;
                node.oy = node.y;
                node.oSize = node.size;
                node.color = colorstr;
                node.destroyed = 0;
            } else {
                node = new Cell(nodeid, posX, posY, size, colorstr, name, _skin);
                nodelist.push(node);
                nodes[nodeid] = node;
                node.ka = posX;
                node.la = posY;
            }
            var dyingIdx = Cells.indexOf(node);
            if (dyingIdx !== -1) {
                Cells.splice(dyingIdx, 1);
            }
            node.destroyed = 0;
            node.isVirus = flagVirus;
            node.isAgitated = flagAgitated;
            node.nx = posX;
            node.ny = posY;
            node.nSize = size;
            node.updateCode = code;
            node.updateTime = timestamp;
            node.flag = flags;
            name && node.setName(name);
            if (-1 != nodesOnScreen.indexOf(nodeid) && -1 == playerCells.indexOf(node)) {
                document.getElementById("overlays").style.display = "none";
                hasOverlay = 0;
                hasSpawnedOnce = 1;
                wHandle.isSpectating = 0;
                wHandle.isFreeRoam = 0;
                playerCells.push(node);
                if (1 == playerCells.length) {
                    nodeX = posX = node.x;
                    nodeY = posY = node.y;
                    viewZoom = 1.0 * viewRange();
                }
            }
        }
        queueLength = view.getUint32(offset, 1);
        offset += 4;
        for (i = 0; i < queueLength; i++) {
            var nodeId = view.getUint32(offset, 1);
            offset += 4;
            node = nodes[nodeId];
            null != node && node.destroy();
        }
        if (ua && 0 == playerCells.length) {
            if (typeof wHandle.playGameSound === 'function') {
                wHandle.playGameSound('death');
            }
            showOverlays(0);
        }
    }
    function sendMouseMove() {
        var msg;
        if (wsIsOpen()) {
            if (hasOverlay && !wHandle.isSpectating) return;
            msg = rawMouseX - canvasWidth / 2;
            var b = rawMouseY - canvasHeight / 2;
            if (64 <= msg * msg + b * b && !(.01 > Math.abs(oldX - X) && .01 > Math.abs(oldY - Y))) {
                oldX = X;
                oldY = Y;
                msg = prepareData(21);
                msg.setUint8(0, 16);
                msg.setFloat64(1, X, 1);
                msg.setFloat64(9, Y, 1);
                msg.setUint32(17, 0, 1);
                wsSend(msg);
            }
        }
    }
    function sendNickName() {
        if (wsIsOpen() && null != userNickName) {
            var msg = prepareData(1 + 2 * userNickName.length);
            msg.setUint8(0, 0);
            for (var i = 0; i < userNickName.length; ++i) msg.setUint16(1 + 2 * i, userNickName.charCodeAt(i), 1);
            wsSend(msg);
        }
    }
    function sendChat(str) {
        if (!str) return;
        var loggedUser = null;
        try { loggedUser = localStorage.getItem('blobz_logged_user'); } catch(e){}
        if (!loggedUser || (userNickName && userNickName.indexOf('Blobs#') === 0)) {
            return; // Guests cannot send chat
        }
        str = str.trim().substr(0, 35);
        if (wsIsOpen() && (str.length > 0) && !hideChat) {
            var msg = prepareData(2 + 2 * str.length);
            var offset = 0;
            msg.setUint8(offset++, 99);
            msg.setUint8(offset++, 0); // flags (0 for now)
            for (var i = 0; i < str.length; ++i) {
                msg.setUint16(offset, str.charCodeAt(i), 1);
                offset += 2;
            }
            wsSend(msg);
        }
    }
    function wsIsOpen() {
        return null != ws && ws.readyState == ws.OPEN;
    }
    function sendUint8(a) {
        if (wsIsOpen()) {
            var msg = prepareData(1);
            msg.setUint8(0, a);
            wsSend(msg);
        }
    }
    function redrawGameScene() {
        drawScene();
        wHandle.reqAnimFrame(redrawGameScene);
    }
    function canvasResize() {
        window.scrollTo(0, 0);
        canvasWidth = wHandle.innerWidth;
        canvasHeight = wHandle.innerHeight;
        nCanvas.width = canvasWidth;
        nCanvas.height = canvasHeight;
        drawScene();
    }
    function viewRange() {
        var ratio = Math.max(canvasHeight / 1080, canvasWidth / 1920);
        return ratio * zoom;
    }
    function calcViewZoom() {
        if (0 != playerCells.length) {
            for (var newViewZoom = 0, i = 0; i < playerCells.length; i++) newViewZoom += playerCells[i].size;
            // Enhanced wide field of view (0.40 power, min zoom capped at 0.18 for spacious tactical awareness)
            newViewZoom = Math.pow(Math.min(64 / newViewZoom, 1), 0.40) * viewRange();
            viewZoom = (9 * viewZoom + newViewZoom) / 10;
            if (viewZoom < 0.18) viewZoom = 0.18;
            if (viewZoom > 2.0) viewZoom = 2.0;
        }
    }
    function drawScene() {
        var a, oldtime = Date.now();
        ++cb;
        timestamp = oldtime;
        if (0 < playerCells.length) {
            calcViewZoom();
            var c = a = 0;
            for (var d = 0; d < playerCells.length; d++) {
                playerCells[d].updatePos();
                a += playerCells[d].x / playerCells.length;
                c += playerCells[d].y / playerCells.length;
            }
            posX = a;
            posY = c;
            posSize = viewZoom / (viewRange() || 1);
            nodeX = (nodeX + a) / 2;
            nodeY = (nodeY + c) / 2;
        } else {
            var lerpFactor = wHandle.isSpectating ? 0.22 : 0.05;
            nodeX += (posX - nodeX) * lerpFactor;
            nodeY += (posY - nodeY) * lerpFactor;
            var targetZoom = (posSize || 1) * viewRange();
            viewZoom += (targetZoom - viewZoom) * lerpFactor;
            if (viewZoom < 0.18) viewZoom = 0.18;
            if (viewZoom > 2.0) viewZoom = 2.0;
        }
        buildQTree();
        mouseCoordChange();
        acidMode || ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (acidMode) {
            if (showDarkTheme) {
                ctx.fillStyle = '#111';
                ctx.globalAlpha = .07;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = '#F2FBFF';
                ctx.globalAlpha = .07;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            }
        } else {
            drawGrid();
        }
        for (d = nodelist.length - 1; d >= 0; d--) {
            var nlNode = nodelist[d];
            if (!nlNode || nlNode.destroyed || (nlNode.updateTime && timestamp - nlNode.updateTime > 2500 && playerCells.indexOf(nlNode) === -1)) {
                nodelist.splice(d, 1);
                if (nlNode && nlNode.id) delete nodes[nlNode.id];
            }
        }
        nodelist.sort(function(a, b) {
            return a.size == b.size ? a.id - b.id : a.size - b.size;
        });
        ctx.save();
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(viewZoom, viewZoom);
        ctx.translate(-nodeX, -nodeY);
        drawSectors(ctx);
        for (d = 0; d < nodelist.length; d++) nodelist[d].drawOneCell(ctx);
        if (drawLine) {
            drawLineX = (3 * drawLineX + lineX) / 4;
            drawLineY = (3 * drawLineY + lineY) / 4;
            ctx.save();
            ctx.strokeStyle = "#FAA";
            ctx.lineWidth = 10;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = .5;
            ctx.beginPath();
            for (d = 0; d < playerCells.length; d++) {
                ctx.moveTo(playerCells[d].x, playerCells[d].y);
                ctx.lineTo(drawLineX, drawLineY);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        lbCanvas && lbCanvas.width && ctx.drawImage(lbCanvas, canvasWidth - lbCanvas.width - 14, 14); // Draw Leader Board
        if (chatCanvas != null && !hideChat) ctx.drawImage(chatCanvas, 0, canvasHeight - chatCanvas.height - 85); // Draw Chat Board

        // Spectate Mode Top Banner
        if (wHandle.isSpectating) {
            ctx.save();
            ctx.font = "bold 13.5px Assistant, sans-serif";
            var specText = wHandle.isFreeRoam ? 
                "מצב צפייה חופשית • הזיזו את העכבר לטיסה במפה • מקש Q: מעקב שחקנים • ESC: תפריט" : 
                "מעקב שחקנים • מקש Space: החלפת שחקן • מקש Q: צפייה חופשית • ESC: תפריט";
            var textWidth = ctx.measureText(specText).width;
            var barW = textWidth + 32, barH = 32;
            var barX = (canvasWidth - barW) / 2, barY = 16;
            ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(barX, barY, barW, barH, 16);
            else ctx.rect(barX, barY, barW, barH);
            ctx.fill();
            ctx.strokeStyle = wHandle.isFreeRoam ? "#10b981" : "#38bdf8";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(specText, canvasWidth / 2, barY + barH / 2);
            ctx.restore();
        }

        // --- Authentic Blobz.co.il Minimap (Top Left Radar) ---
        (function drawBlobzMinimap() {
            var mW = 105, mH = 105, mX = 14, mY = 14;
            ctx.save();
            ctx.fillStyle = "rgba(22, 28, 38, 0.78)";
            ctx.beginPath();
            var rad = 8;
            ctx.moveTo(mX + rad, mY);
            ctx.lineTo(mX + mW - rad, mY);
            ctx.quadraticCurveTo(mX + mW, mY, mX + mW, mY + rad);
            ctx.lineTo(mX + mW, mY + mH - rad);
            ctx.quadraticCurveTo(mX + mW, mY + mH, mX + mW - rad, mY + mH);
            ctx.lineTo(mX + rad, mY + mH);
            ctx.quadraticCurveTo(mX, mY + mH, mX, mY + mH - rad);
            ctx.lineTo(mX, mY + rad);
            ctx.quadraticCurveTo(mX, mY, mX + rad, mY);
            ctx.closePath();
            ctx.fill();

            // Grid lines (5x5 sectors)
            ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            ctx.lineWidth = 1;
            ctx.font = "8px Assistant, sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            var cols = 5, rows = 5;
            var cW = mW / cols, cH = mH / rows;
            var letters = ["A", "B", "C", "D", "E"];
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    ctx.strokeRect(mX + c * cW, mY + r * cH, cW, cH);
                    ctx.fillText(letters[r] + (c + 1), mX + c * cW + cW / 2, mY + r * cH + cH / 2);
                }
            }

            // Player position dot
            var totalW = (maxX - minX) || 10000;
            var totalH = (maxY - minY) || 10000;
            var normX = Math.max(0, Math.min(1, (nodeX - minX) / totalW));
            var normY = Math.max(0, Math.min(1, (nodeY - minY) / totalH));
            var dotX = mX + normX * mW;
            var dotY = mY + normY * mH;

            // Pulsing player dot
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        })();

        // --- Authentic Blobz.co.il Bottom-Left Score Bar (Updated via HTML element) ---
        var curMass = ~~(calcScore() / 100);
        userScore = Math.max(userScore, curMass);
        var scoreEl = document.getElementById("blobz-score-text");
        if (scoreEl) {
            scoreEl.textContent = "הכי הרבה: " + userScore + ". עכשיו: " + curMass;
        }

        // Record all-time high score for registered user or current player (Throttled to once every 2s for maximum 60FPS smoothness)
        var nowTs = Date.now();
        if (userScore > 0 && (!wHandle.lastScoreSave || nowTs - wHandle.lastScoreSave > 2000)) {
            wHandle.lastScoreSave = nowTs;
            var activeName = ((playerCells[0] && playerCells[0].name) || userNickName || localStorage.getItem('blobz_logged_user') || '').trim();
            if (activeName) {
                try {
                    var allTimeScores = JSON.parse(localStorage.getItem('blobz_alltime_lb') || '{}');
                    if (!allTimeScores[activeName] || userScore > allTimeScores[activeName]) {
                        allTimeScores[activeName] = userScore;
                        localStorage.setItem('blobz_alltime_lb', JSON.stringify(allTimeScores));
                        if (typeof wHandle.submitGlobalScore === 'function') {
                            wHandle.submitGlobalScore(activeName, userScore);
                        }
                    }
                } catch(e){}
            }
        }
        drawSplitIcon(ctx);
        drawTouch(ctx);
        var deltatime = Date.now() - oldtime;
        deltatime > 1E3 / 60 ? z -= .01 : deltatime < 1E3 / 65 && (z += .01);
        .4 > z && (z = .4);
        1 < z && (z = 1);
    }
    function drawTouch(ctx) {
        ctx.save();
        if (touchable) {
            for (var i = 0; i < touches.length; i++) {
                var touch = touches[i];
                if (touch.identifier == leftTouchID) {
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096FF";
                    ctx.lineWidth = 6;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 40, 0, Math.PI * 2, 1);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096FF";
                    ctx.lineWidth = 2;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 60, 0, Math.PI * 2, 1);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096FF";
                    ctx.arc(leftTouchPos.x, leftTouchPos.y, 40, 0, Math.PI * 2, 1);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096FF";
                    ctx.lineWidth = "6";
                    ctx.arc(touch.clientX, touch.clientY, 40, 0, Math.PI * 2, 1);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
    function drawGrid() {
        ctx.fillStyle = showDarkTheme ? "#111827" : "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.save();
        ctx.strokeStyle = showDarkTheme ? "#374151" : "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.globalAlpha = showDarkTheme ? .35 : .65;
        var safeZoom = Math.max(0.05, Math.min(2.5, viewZoom || 1));
        ctx.scale(safeZoom, safeZoom);
        var a = canvasWidth / safeZoom,
            b = canvasHeight / safeZoom;
        if (showGrid && safeZoom >= 0.1) {
            var startX = -.5 + (-nodeX + a / 2) % 50;
            for (var c = startX; c < a; c += 50) {
                ctx.beginPath();
                ctx.moveTo(c, 0);
                ctx.lineTo(c, b);
                ctx.stroke();
            }
            var startY = -.5 + (-nodeY + b / 2) % 50;
            for (c = startY; c < b; c += 50) {
                ctx.beginPath();
                ctx.moveTo(0, c);
                ctx.lineTo(a, c);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    function drawSplitIcon(ctx) {
        if (isTouchStart && splitIcon.width) {
            var size = ~~(canvasWidth / 7);
            ctx.drawImage(splitIcon, canvasWidth - size, canvasHeight - size, size, size);
        }
        if (isTouchStart && splitIcon.width) {
            size = ~~(canvasWidth / 7);
            ctx.drawImage(ejectIcon, canvasWidth - size, canvasHeight - 2 * size - 10, size, size);
        }
    }
    function calcScore() {
        for (var score = 0, i = 0; i < playerCells.length; i++) score += playerCells[i].nSize * playerCells[i].nSize;
        return score;
    }
    function drawLB() {
        lbCanvas = null;
        if (null != teamScores || 0 != leaderBoard.length) {
            lbCanvas = document.createElement("canvas");
            var ctx = lbCanvas.getContext("2d"),
                boardLength = 65;
            boardLength = null == teamScores ? boardLength + 25 * leaderBoard.length : boardLength + 180;
            var scaleFactor = Math.min(.26 * canvasHeight, Math.min(220, .3 * canvasWidth)) / 220;
            lbCanvas.width = 220 * scaleFactor;
            lbCanvas.height = boardLength * scaleFactor;
            ctx.scale(scaleFactor, scaleFactor);

            // Authentic Blobz Dark Translucent Rounded Panel
            ctx.save();
            ctx.fillStyle = "rgba(22, 28, 38, 0.82)";
            var rw = 220, rh = boardLength, rrad = 12;
            ctx.beginPath();
            ctx.moveTo(rrad, 0);
            ctx.lineTo(rw - rrad, 0);
            ctx.quadraticCurveTo(rw, 0, rw, rrad);
            ctx.lineTo(rw, rh - rrad);
            ctx.quadraticCurveTo(rw, rh, rw - rrad, rh);
            ctx.lineTo(rrad, rh);
            ctx.quadraticCurveTo(0, rh, 0, rh - rrad);
            ctx.lineTo(0, rrad);
            ctx.quadraticCurveTo(0, 0, rrad, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // "טבלת מובילים" Header
            ctx.fillStyle = "#FFFFFF";
            var c = "טבלת מובילים";
            ctx.font = "bold 22px Assistant, Rubik, sans-serif";
            ctx.fillText(c, 110 - ctx.measureText(c).width / 2, 38);

            var b;
            if (null == teamScores) {
                ctx.font = "bold 14.5px Assistant, Rubik, sans-serif";
                for (b = 0; b < leaderBoard.length; ++b) {
                    var entry = leaderBoard[b];
                    c = (entry && entry.name) ? entry.name : "שחקן אנונימי";
                    if (!noRanking) c = (b + 1) + ". " + c;

                    // Authentic Blobz top 3 rank colors: 1 = Pink, 2 = Orange, 3 = Yellow
                    if (playerCells.length > 0 && -1 != nodesOnScreen.indexOf(entry.id)) {
                        playerCells[0].name && (c = (b + 1) + ". " + playerCells[0].name);
                        ctx.fillStyle = "#38bdf8"; // Current player highlighted in cyan
                    } else if (b === 0) {
                        ctx.fillStyle = "#ff2d75"; // 1st: Pink
                    } else if (b === 1) {
                        ctx.fillStyle = "#ff7b00"; // 2nd: Orange
                    } else if (b === 2) {
                        ctx.fillStyle = "#ffd600"; // 3rd: Yellow
                    } else {
                        ctx.fillStyle = "#f1f5f9"; // 4+: Crisp White
                    }
                    ctx.fillText(c, 110 - ctx.measureText(c).width / 2, 68 + 24 * b);
                }
            } else {
                for (b = c = 0; b < teamScores.length; ++b) {
                    var d = c + teamScores[b] * Math.PI * 2;
                    ctx.fillStyle = teamColor[b + 1];
                    ctx.beginPath();
                    ctx.moveTo(110, 140);
                    ctx.arc(110, 140, 80, c, d, 0);
                    ctx.fill();
                    c = d;
                }
            }
        }
    }
    function drawBorders() {
        return;
    }
    function drawSectors() {
        if (!showSectors) return;
        //ctx.strokeRect(minX, maxY, 500, 500);
        var x = Math.round(minX) + 65;
        var y = Math.round(minY) + 65;
        var letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        var w = (Math.round(maxX) - 65 - x) / 5;
        var h = (Math.round(maxY) - 65 - y) / 5;
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = .05;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = w * .6 + "px Russo One";
        if (!String($("#sectorColor").val())) var color = "1A1A1A";
        else color = String($("#sectorColor").val());
        ctx.fillStyle = "#" + color;
        var j = 0;
        for (; 5 > j; j++) {
            var i = 0;
            for (; 5 > i; i++) ctx.fillText(letter[j] + (i + 1), x + w * i + w / 2, y + h * j + h / 2);
        }
        ctx.lineWidth = 100;
        ctx.strokeStyle = "#" + color;
        j = 0;
        for (; 5 > j; j++) {
            i = 0;
            for (; 5 > i; i++) ctx.strokeRect(x + w * i, y + h * j, w, h);
        }
        ctx.stroke();
        ctx.restore();
    }
    function Cell(uid, ux, uy, usize, ucolor, uname, a) {
        this.id = uid;
        this.ox = this.x = ux;
        this.oy = this.y = uy;
        this.oSize = this.size = usize;
        this.color = ucolor;
        this.points = [];
        this.pointsAcc = [];
        this.createPoints();
        this.setName(uname);
        this._skin = a;
    }
    function UText(usize, ucolor, ustroke, ustrokecolor) {
        usize && (this._size = usize);
        ucolor && (this._color = ucolor);
        this._stroke = !!ustroke;
        ustrokecolor && (this._strokeColor = ustrokecolor);
    }
    var nCanvas,
        ctx,
        mainCanvas,
        lbCanvas,
        chatCanvas,
        canvasWidth,
        canvasHeight,
        qTree = null,
        ws = null,
        nodeX = 0,
        nodeY = 0,
        nodesOnScreen = [],
        playerCells = [],
        nodes = {},
        nodelist = [],
        Cells = [],
        leaderBoard = [],
        chatBoard = [],
        rawMouseX = 0,
        rawMouseY = 0,
        X = -1,
        Y = -1,
        cb = 0,
        timestamp = 0,
        userNickName = null,
        leftPos = 0,
        topPos = 0,
        rightPos = 1E4,
        bottomPos = 1E4,
        viewZoom = 1,
        ua = 0,
        userScore = 0,
        /* v settings v */
        showSkin = 1,
        showName = 1,
        showColor = 0,
        showCellBorder = 1,
        showPosition = 0,
        showDarkTheme = 0,
        showSectors = 0,
        nameShadows = 1,
        showMass = 1,
        showGrid = 1,
        hideChat = 0,
        showBorders = 0,
        transparentCells = 0,
        smoothRender = 0.1,
        infiniteZoom = 1,
        /* ^ settings ^ */
        posX = nodeX = ~~((leftPos + rightPos) / 2),
        posY = nodeY = ~~((topPos + bottomPos) / 2),
        posSize = 1,
        gameMode = "",
        teamScores = null,
        connecting = 0,
        hasOverlay = 1,
        hasSpawnedOnce = 0,
        drawLine = 0,
        lineX = 0,
        lineY = 0,
        drawLineX = 0,
        drawLineY = 0,
        Ra = 0,
        teamColor = ["#333333", "#FF3333", "#33FF33", "#3333FF"],
        acidMode = 0,
        zoom = 1,
        isTouchStart = "ontouchstart" in wHandle && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        splitIcon = new Image,
        ejectIcon = new Image,
        minX = 0,
        minY = 0,
        maxX = 0,
        maxY = 0,
        noRanking = 0;
    splitIcon.src = "assets/img/split.png";
    ejectIcon.src = "assets/img/feed.png";
    wHandle.isSpectating = 0;
    wHandle.setNick = function(arg) {
        hideOverlays();
        wHandle.isSpectating = 0;
        wHandle.isFreeRoam = 0;
        wHandle.firstSpecFrame = 0;
        userNickName = arg;
        sendNickName();
        userScore = 0;
        if (typeof wHandle.playGameSound === 'function') {
            wHandle.playGameSound('start');
        }
    };
    wHandle.setSkins = function(arg) {
        showSkin = arg;
    };
    wHandle.setNames = function(arg) {
        showName = arg;
    };
    wHandle.setCellBorder = function(arg) {
        showCellBorder = arg;
    };
    wHandle.setCellPos = function (arg) {
        showPosition = arg;
    };
    wHandle.setDarkTheme = function(arg) {
        showDarkTheme = arg;
    };
    wHandle.setColors = function(arg) {
        showColor = arg;
    };
    wHandle.setShowMass = function(arg) {
        showMass = arg;
    };
    wHandle.setSmooth = function(arg) {
        smoothRender = arg ? 2 : 0;
    };
    wHandle.setMapBorders = function(arg) {
        showBorders = 0;
    };
    wHandle.setMapSectors = function(arg) {
        showSectors = 0;
    };
    wHandle.setNameShadows = function(arg) {
        nameShadows = arg;
    };
    wHandle.setZoom = function(arg) {
        infiniteZoom = arg;
    };
    wHandle.setChatHide = function(arg) {
        hideChat = arg;
        hideChat ? wjQuery('#chat_textbox').hide() : wjQuery('#chat_textbox').show();
    };
    wHandle.setMapGrid = function(arg) {
        showGrid = arg;
    };
    wHandle.setTransparent = function(arg) {
        transparentCells = arg;
    };
    wHandle.sendAdminAction = function(actionId, param1, param2) {
        if (wsIsOpen()) {
            var msg = prepareData(10);
            msg.setUint8(0, 40);
            msg.setUint8(1, actionId || 0);
            msg.setInt32(2, param1 || 0, 1);
            msg.setInt32(6, param2 || 0, 1);
            wsSend(msg);
        }
    };
    wHandle.spawnBots = function(count) {
        count = count || 5;
        if (wsIsOpen()) {
            var msg = prepareData(5);
            msg.setUint8(0, 30);
            msg.setUint16(1, count, 1);
            msg.setUint16(3, 10, 1);
            wsSend(msg);
        }
    };
    wHandle.removeBots = function() {
        if (wsIsOpen()) {
            sendUint8(31);
        }
    };
    wHandle.firstSpecFrame = 0;
    wHandle.isFreeRoam = 0;
    wHandle.spectate = function() {
        if (playerCells.length > 0) {
            // Cannot spectate while alive in game!
            return;
        }
        if (wHandle.isSpectating) {
            wHandle.isSpectating = 0;
            wHandle.isFreeRoam = 0;
            showOverlays(1);
            return;
        }
        userNickName = null;
        wHandle.isSpectating = 1;
        wHandle.firstSpecFrame = 1;
        wHandle.isFreeRoam = 0;
        playerCells = [];
        sendUint8(1);
        hideOverlays();
    };
    wHandle.setGameMode = function(arg) {
        if (arg != gameMode) {
            gameMode = arg;
            showConnecting();
        }
    };
    wHandle.setAcid = function(arg) {
        acidMode = arg;
    };
    if (null != wHandle.localStorage) {
        if (null == wHandle.localStorage.AB8) {
            wHandle.localStorage.AB8 = ~~(100 * Math.random());
        }
        Ra = +wHandle.localStorage.AB8;
        wHandle.ABGroup = Ra;
    }
    setTimeout(function() {}, 3E5);
    var T = {
        ZW: "EU-London"
    };
    wHandle.connect = wsConnect;
    var data = {
        "action": "test"
    };
    /*var response = null;
    wjQuery.ajax({
        type: "POST",
        dataType: "json",
        //url: "checkdir.php",
        data: data,
        success: function(data) {
            response = JSON.parse(data["names"]);
        }
    });
    var interval1Id = setInterval(function() {
        wjQuery.ajax({
            type: "POST",
            dataType: "json",
            //url: "checkdir.php",
            data: data,
            success: function(data) {
                response = JSON.parse(data["names"]);
            }
        });
        for (var i = 0; i < response; i++) {
            if (-1 == knownNameDict.indexOf(response[i])) {
                knownNameDict.push(response[i]);
            }
        }
    }, 15000);*/
    var delay = 500, // Animation delay (for non-smooth rendering instances)
        oldX = -1,
        oldY = -1,
        z = 1,
        scoreText = null,
        skins = {},
        knownNameDict = "ugandan knuckles;latvia;fidget red;fidget blue;fidget black;fidget green;fidget yellow;fidget grey;fidget orange;fidget white;fidget spinner;illuminati;dodge charger;cr king;dark theme;mercury;cell;virus;basketball;rockstar n;penta;rockstar s;penta;creeper;dragon;chrome;hellcat;poland;usa;china;russia;canada;australia;spain;brazil;germany;ukraine;france;sweden;chaplin;north korea;south korea;japan;united kingdom;earth;greece;latvia;lithuania;estonia;finland;norway;cia;maldivas;ussr;austria;nigeria;reddit;yaranaika;confederate;9gag;indiana;imperial japan;apple;4chan;italy;cat;bulgaria;tumblr;2ch.hk;hong kong;portugal;jamaica;german empire;mexico;sanik;switzerland;croatia;chile;indonesia;bangladesh;thailand;iran;iraq;peru;moon;botswana;bosnia;netherlands;european union;taiwan;pakistan;hungary;satanist;qing dynasty;matriarchy;patriarchy;feminism;ireland;texas;facepunch;prodota;cambodia;steam;piccolo;ea;india;kc;denmark;quebec;ayy lmao;sealand;bait;tsarist russia;origin;vinesauce;stalin;belgium;luxembourg;stussy;prussia;8ch;argentina;scotland;sir;romania;wojak;doge;nasa;byzantium;imperial japan;french kingdom;somalia;turkey;mars;pokerface;8;irs;receita federal;illuminati;facebook;putin;merkel;tsipras;obama;kim jong-un;dilma;hollande;berlusconi;cameron;clinton;hillary;venezuela;blatter;chavez;cuba;fidel;merkel;palin;queen;boris;bush;trump;underwood".split(";"),
        knownNameDict_noDisp = "ugandan knuckles;fidget red;fidget blue;fidget black;fidget green;fidget yellow;fidget grey;fidget orange;fidget white;fidget spinner;cell;virus;8;EA;hellcat;cr king;nasa;putin;merkel;tsipras;obama;kim jong-un;dilma;hollande;berlusconi;cameron;clinton;hillary;blatter;chavez;fidel;merkel;palin;queen;boris;bush;trump;underwood;dodge charger;dark theme",
        ib = ["_canvas'blob"];
    Cell.prototype = {
        id: 0,
        points: null,
        pointsAcc: null,
        name: null,
        nameCache: null,
        sizeCache: null,
        x: 0,
        y: 0,
        size: 0,
        ox: 0,
        oy: 0,
        oSize: 0,
        nx: 0,
        ny: 0,
        nSize: 0,
        flag: 0,
        updateTime: 0,
        updateCode: 0,
        drawTime: 0,
        destroyed: 0,
        isVirus: 0,
        isAgitated: 0,
        wasSimpleDrawing: 1,
        destroy: function() {
            var tmp;
            for (tmp = nodelist.length - 1; tmp >= 0; tmp--) {
                if (nodelist[tmp] == this) {
                    nodelist.splice(tmp, 1);
                    break;
                }
            }
            delete nodes[this.id];
            tmp = playerCells.indexOf(this);
            if (-1 != tmp) {
                ua = 1;
                playerCells.splice(tmp, 1);
            }
            tmp = nodesOnScreen.indexOf(this.id);
            if (-1 != tmp) {
                nodesOnScreen.splice(tmp, 1);
            }
            tmp = Cells.indexOf(this);
            if (-1 != tmp) {
                Cells.splice(tmp, 1);
            }
            this.destroyed = 1;
        },
        getNameSize: function() {
            return Math.max(~~(this.size / 3.2), 2);
        },
        setName: function(a) {
            this.name = a;
            if (null == this.nameCache) {
                this.nameCache = new UText(this.getNameSize(), "#FFFFFF", 1, "#000000");
                this.nameCache.setValue(this.name);
            } else {
                this.nameCache.setSize(this.getNameSize());
                this.nameCache.setValue(this.name);
            }
        },
        createPoints: function() {
            for (var samplenum = this.getNumPoints(); this.points.length > samplenum;) {
                var rand = ~~(Math.random() * this.points.length);
                this.points.splice(rand, 1);
                this.pointsAcc.splice(rand, 1);
            }
            if (0 == this.points.length && 0 < samplenum) {
                this.points.push({
                    ref: this,
                    size: this.size,
                    x: this.x,
                    y: this.y
                });
                this.pointsAcc.push(Math.random() - .5);
            }
            while (this.points.length < samplenum) {
                var rand2 = ~~(Math.random() * this.points.length),
                    point = this.points[rand2];
                this.points.splice(rand2, 0, {
                    ref: this,
                    size: point.size,
                    x: point.x,
                    y: point.y
                });
                this.pointsAcc.splice(rand2, 0, this.pointsAcc[rand2]);
            }
        },
        getNumPoints: function() {
            if (0 == this.id) return 16;
            var a = 10;
            if (20 > this.size) a = 0;
            if (this.isVirus) a = 30;
            var b = this.size;
            if (!this.isVirus)(b *= viewZoom);
            b *= z;
            if (this.flag & 32)(b *= .25);
            return ~~Math.max(b, a);
        },
        movePoints: function() {
            this.createPoints();
            for (var points = this.points, pointsacc = this.pointsAcc, numpoints = points.length, i = 0; i < numpoints; ++i) {
                var pos1 = pointsacc[(i - 1 + numpoints) % numpoints],
                    pos2 = pointsacc[(i + 1) % numpoints];
                pointsacc[i] += (Math.random() - .5) * (this.isAgitated ? 3 : 1);
                pointsacc[i] *= .7;
                10 < pointsacc[i] && (pointsacc[i] = 10); - 10 > pointsacc[i] && (pointsacc[i] = -10);
                pointsacc[i] = (pos1 + pos2 + 8 * pointsacc[i]) / 10;
            }
            for (var ref = this, isvirus = this.isVirus ? 0 : (this.id / 1E3 + timestamp / 1E4) % (2 * Math.PI), j = 0; j < numpoints; ++j) {
                var f = points[j].size,
                    e = points[(j - 1 + numpoints) % numpoints].size,
                    m = points[(j + 1) % numpoints].size;
                if (15 < this.size && null != qTree && 20 < this.size * viewZoom && 0 != this.id) {
                    var l = 0,
                        n = points[j].x,
                        q = points[j].y;
                    qTree.retrieve2(n - 5, q - 5, 10, 10, function(a) {
                        if (a.ref != ref && 25 > (n - a.x) * (n - a.x) + (q - a.y) * (q - a.y)) {
                            l = 1;
                        }
                    });
                    if (!l && points[j].x < leftPos || points[j].y < topPos || points[j].x > rightPos || points[j].y > bottomPos) {
                        l = 1;
                    }
                    if (l) {
                        if (0 < pointsacc[j]) (pointsacc[j] = 0);
                        pointsacc[j] -= 1;
                    }
                }
                f += pointsacc[j];
                0 > f && (f = 0);
                f = this.isAgitated ? (19 * f + this.size) / 20 : (12 * f + this.size) / 13;
                points[j].size = (e + m + 8 * f) / 10;
                e = 2 * Math.PI / numpoints;
                m = this.points[j].size;
                this.isVirus && 0 == j % 2 && (m += 5);
                points[j].x = this.x + Math.cos(e * j + isvirus) * m;
                points[j].y = this.y + Math.sin(e * j + isvirus) * m;
            }
        },
        updatePos: function() {
            if (0 == this.id) return 1;
            var a = (timestamp - this.updateTime) / 120;
            a = a < 0 ? 0 : a > 1 ? 1 : a;
            this.getNameSize();
            if (this.destroyed && 1 <= a) {
                var c = Cells.indexOf(this);
                if (-1 != c) Cells.splice(c, 1);
            }
            this.x = a * (this.nx - this.ox) + this.ox;
            this.y = a * (this.ny - this.oy) + this.oy;
            this.size = a * (this.nSize - this.oSize) + this.oSize;
            return a;
        },
        shouldRender: function() {
            if (0 == this.id) return 1;
            else {
                return !(this.x + this.size + 40 < nodeX - canvasWidth / 2 / viewZoom ||
                this.y + this.size + 40 < nodeY - canvasHeight / 2 / viewZoom ||
                this.x - this.size - 40 > nodeX + canvasWidth / 2 / viewZoom ||
                this.y - this.size - 40 > nodeY + canvasHeight / 2 / viewZoom);
            }
        },
        drawOneCell: function(ctx) {
            if (this.shouldRender()) {
                var b = (0 != this.id && !this.isVirus && smoothRender > viewZoom);
                if (10 > this.getNumPoints()) b = 1;
                if (this.wasSimpleDrawing && !b)
                    for (var c = 0; c < this.points.length; c++) this.points[c].size = this.size;
                this.wasSimpleDrawing = b;
                ctx.save();
                this.drawTime = timestamp;
                c = this.updatePos();
                this.destroyed && (ctx.globalAlpha *= 1 - c);
                ctx.lineWidth = 10;
                ctx.lineCap = "round";
                ctx.lineJoin = this.isVirus ? "miter" : "round";
                ctx.globalAlpha = transparentCells ? .5 : 1;
                var cellName = (this.name || "").trim();
                var skinName = cellName.toLowerCase();
                if (skinName.indexOf('[') != -1) {
                    var clanStart = skinName.indexOf('[');
                    var clanEnd = skinName.indexOf(']');
                    skinName = skinName.slice(clanStart + 1, clanEnd);
                }
                var isPlayer = (-1 != playerCells.indexOf(this));
                var playerName = ((playerCells[0] && playerCells[0].name) || userNickName || ($("#nick").val() || "")).trim();
                var isBotOrPlayer = isPlayer || (cellName && playerName && cellName.toLowerCase() === playerName.toLowerCase());

                var isBlobsSkin = false;
                var skinImg = null;
                var userCustomImg = wHandle.getUserSkinImage(cellName) || (isBotOrPlayer && playerName ? wHandle.getUserSkinImage(playerName) : null);

                if (!this.isVirus && showSkin && userCustomImg && userCustomImg.complete) {
                    skinImg = userCustomImg;
                } else if (isBotOrPlayer && wHandle.customPlayerSkinImg && wHandle.customPlayerSkinImg.complete && showSkin) {
                    skinImg = wHandle.customPlayerSkinImg;
                } else if (!this.isVirus && showSkin && (
                    (cellName && cellName.toLowerCase().indexOf("blobs") === 0) ||
                    (isBotOrPlayer && playerName && playerName.toLowerCase().indexOf("blobs") === 0)
                )) {
                    isBlobsSkin = true;
                } else if (!this.isAgitated && showSkin && teamScores == null) {
                    var lookupSkin = skinName;
                    if (isBotOrPlayer && playerName) {
                        var pSkin = playerName.toLowerCase();
                        if (pSkin.indexOf('[') != -1) pSkin = pSkin.slice(pSkin.indexOf('[') + 1, pSkin.indexOf(']'));
                        if (-1 != knownNameDict.indexOf(pSkin)) lookupSkin = pSkin;
                    }
                    if (-1 != knownNameDict.indexOf(lookupSkin)) {
                        if (!skins[lookupSkin]) {
                            skins[lookupSkin] = new Image;
                            skins[lookupSkin].src = SKIN_URL + lookupSkin + '.png';
                        }
                        if (skins[lookupSkin] && 0 != skins[lookupSkin].width && skins[lookupSkin].complete) {
                            skinImg = skins[lookupSkin];
                        }
                    }
                }

                // If cell has a skin or is a regular player/bot cell, render as a clean stable circle
                var useStableCircle = (skinImg != null) || isBlobsSkin || (!this.isVirus && smoothRender > 0);
                ctx.beginPath();
                if (useStableCircle) {
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                } else {
                    this.movePoints();
                    var d = this.getNumPoints();
                    ctx.moveTo(this.points[0].x, this.points[0].y);
                    for (c = 1; c <= d; ++c) {
                        var pIdx = c % d;
                        ctx.lineTo(this.points[pIdx].x, this.points[pIdx].y);
                    }
                }
                ctx.closePath();

                if (isBlobsSkin) {
                    // Draw official Blobs.co.il skin with cell's dynamic color and player tag/name!
                    drawBlobsSkin(ctx, this.x, this.y, this.size, this.color, this.name);
                } else if (skinImg) {
                    // Draw skin clipped to the circle with object-fit cover (no background bleeding!)
                    ctx.save();
                    ctx.clip();
                    var dw = 2 * this.size;
                    var dh = 2 * this.size;
                    if (skinImg.width && skinImg.height) {
                        var aspect = skinImg.width / skinImg.height;
                        if (aspect > 1) {
                            dw = dh * aspect;
                        } else {
                            dh = dw / aspect;
                        }
                    }
                    ctx.drawImage(skinImg, this.x - dw / 2, this.y - dh / 2, dw, dh);
                    ctx.restore();
                    // Authentic Agar.io: No colored border on skins for a clean, borderless avatar
                } else {
                    // No skin: fill with cell color and stroke
                    ctx.fillStyle = showColor ? "#FFF" : this.color;
                    ctx.fill();
                    if (showCellBorder && this.size >= 15) {
                        ctx.lineWidth = Math.max(3, ~~(this.size * 0.04));
                        ctx.strokeStyle = showColor ? "#AAA" : this.color;
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1;
                var e = skinImg;
                c = -1 != playerCells.indexOf(this);
                var ncache;
                // Draw name and score text
                if (0 != this.id) {
                    var b = ~~this.y;
                    var skipName = isBlobsSkin;
                    if (!skipName && (showName || c) && this.name && this.nameCache && (null == e || -1 == knownNameDict_noDisp.indexOf(skinName))) {
                        ncache = this.nameCache;
                        ncache.setValue(this.name);
                        ncache.setSize(this.getNameSize());
                        var ratio = Math.ceil(10 * viewZoom) / 10;
                        ncache.setScale(ratio);
                        var rnchache = ncache.render(),
                            w = ~~(rnchache.width / ratio),
                            h = ~~(rnchache.height / ratio);
                        ctx.drawImage(rnchache, ~~this.x - ~~(w / 2), b - ~~(h / 2), w, h);
                        b += rnchache.height / 2 / ratio + 4;
                    }
                    if (showMass && (c || 0 == playerCells.length && (!this.isVirus || this.isAgitated) && 20 < this.size)) {
                        if (null == this.sizeCache) {
                            this.sizeCache = new UText(Math.max(12, this.getNameSize() / 2), "#FFF", 1, "#000");
                        }
                        c = this.sizeCache;
                        c.setSize(Math.max(12, this.getNameSize() / 2));
                        c.setValue(~~(this.size * this.size / 100));
                        ratio = Math.ceil(10 * viewZoom) / 10;
                        c.setScale(ratio);
                        e = c.render();
                        w = ~~(e.width / ratio);
                        h = ~~(e.height / ratio);
                        var massY = isBlobsSkin ? (~~this.y + ~~(this.size * 0.42)) : b;
                        ctx.drawImage(e, ~~this.x - ~~(w / 2), massY - ~~(h / 2), w, h);
                    }
                }
                ctx.restore();
            }
        }
    };
    UText.prototype = {
        _value: "",
        _color: "#FFFFFF",
        _stroke: 0,
        _strokeColor: "#000000",
        _size: 16,
        _canvas: null,
        _ctx: null,
        _dirty: 0,
        _scale: 1,
        setSize: function(a) {
            if (this._size != a) {
                this._size = a;
                this._dirty = 1;
            }
        },
        setScale: function(a) {
            if (this._scale != a) {
                this._scale = a;
                this._dirty = 1;
            }
        },
        setStrokeColor: function(a) {
            if (this._strokeColor != a) {
                this._strokeColor = a;
                this._dirty = 1;
            }
        },
        setValue: function(a) {
            if (a != this._value) {
                this._value = a;
                this._dirty = 1;
            }
        },
        render: function() {
            if (null == this._canvas) {
                this._canvas = document.createElement("canvas");
                this._ctx = this._canvas.getContext("2d");
            }
            if (this._dirty) {
                this._dirty = 0;
                var canvas = this._canvas,
                    ctx = this._ctx,
                    value = this._value,
                    scale = this._scale,
                    fontsize = this._size,
                    font = 'bold ' + fontsize + 'px Rubik, Assistant, Ubuntu, sans-serif';
                ctx.font = font;
                var h = ~~(.2 * fontsize);
                canvas.width = (ctx.measureText(value).width + 6) * scale;
                canvas.height = (fontsize + h) * scale;
                ctx.font = font;
                ctx.scale(scale, scale);
                ctx.globalAlpha = 1;
                if (nameShadows) width = 8 * (fontsize * .014);
                else var width = 1;
                ctx.lineWidth = width;
                ctx.strokeStyle = this._strokeColor;
                ctx.fillStyle = this._color;
                this._stroke && ctx.strokeText(value, 3, fontsize - h / 2);
                ctx.fillText(value, 3, fontsize - h / 2);
            }
            return this._canvas;
        },
        getWidth: function() {
            if (this._canvas) return (this._canvas.width / (this._scale || 1));
            var tempCanvas = document.createElement("canvas");
            var tempCtx = tempCanvas.getContext("2d");
            tempCtx.font = 'bold ' + this._size + 'px Rubik, Assistant, Ubuntu, sans-serif';
            return (tempCtx.measureText(this._value).width + 6);
        }
    };
    Date.now || (Date.now = function() {
        return (new Date).getTime();
    });
    var Quad = {
        init: function(args) {
            function Node(x, y, w, h, depth) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.depth = depth;
                this.items = [];
                this.nodes = [];
            }
            var c = args.maxChildren || 2;
            var d = args.maxDepth || 4;
            Node.prototype = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                depth: 0,
                items: null,
                nodes: null,
                exists: function(selector) {
                    for (var i = 0; i < this.items.length; ++i) {
                        var item = this.items[i];
                        if (item.x >= selector.x && item.y >= selector.y && item.x < selector.x + selector.w && item.y < selector.y + selector.h) return 1;
                    }
                    if (0 != this.nodes.length) {
                        var self = this;
                        return this.findOverlappingNodes(selector, function(dir) {
                            return self.nodes[dir].exists(selector);
                        });
                    }
                    return 0;
                },
                retrieve: function(item, callback) {
                    for (var i = 0; i < this.items.length; ++i) callback(this.items[i]);
                    if (0 != this.nodes.length) {
                        var self = this;
                        this.findOverlappingNodes(item, function(dir) {
                            self.nodes[dir].retrieve(item, callback);
                        });
                    }
                },
                insert: function(a) {
                    if (0 != this.nodes.length) {
                        this.nodes[this.findInsertNode(a)].insert(a);
                    } else {
                        if (this.items.length >= c && this.depth < d) {
                            this.devide();
                            this.nodes[this.findInsertNode(a)].insert(a);
                        } else this.items.push(a);
                    }
                },
                findInsertNode: function(a) {
                    return a.x < this.x + this.w / 2 ? a.y < this.y + this.h / 2 ? 0 : 2 : a.y < this.y + this.h / 2 ? 1 : 3;
                },
                findOverlappingNodes: function(a, b) {
                    return a.x < this.x + this.w / 2 &&
                    (a.y < this.y + this.h / 2 && b(0) ||
                    a.y >= this.y + this.h / 2 && b(2)) ||
                    a.x >= this.x + this.w / 2 &&
                    (a.y < this.y + this.h / 2 && b(1) ||
                    a.y >= this.y + this.h / 2 && b(3)) ? 1 : 0;
                },
                devide: function() {
                    var a = this.depth + 1,
                        c = this.w / 2,
                        d = this.h / 2;
                    this.nodes.push(new Node(this.x, this.y, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y, c, d, a));
                    this.nodes.push(new Node(this.x, this.y + d, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y + d, c, d, a));
                    a = this.items;
                    this.items = [];
                    for (c = 0; c < a.length; c++) this.insert(a[c]);
                },
                clear: function() {
                    for (var a = 0; a < this.nodes.length; a++) this.nodes[a].clear();
                    this.items.length = 0;
                    this.nodes.length = 0;
                }
            };
            var internalSelector = {
                x: 0,
                y: 0,
                w: 0,
                h: 0
            };
            return {
                root: new Node(args.minX, args.minY, args.maxX - args.minX, args.maxY - args.minY, 0),
                insert: function(a) {
                    this.root.insert(a);
                },
                retrieve: function(a, b) {
                    this.root.retrieve(a, b);
                },
                retrieve2: function(a, b, c, d, callback) {
                    internalSelector.x = a;
                    internalSelector.y = b;
                    internalSelector.w = c;
                    internalSelector.h = d;
                    this.root.retrieve(internalSelector, callback);
                },
                exists: function(a) {
                    return this.root.exists(a);
                },
                clear: function() {
                    this.root.clear();
                }
            };
        }
    };
    /*wjQuery(function() {
        // Updates favicon color based your on cell color
        function renderFavicon() {
            if (0 < playerCells.length) {
                redCell.color = playerCells[0].color;
                redCell.setName(playerCells[0].name);
            }
            ctx.clearRect(0, 0, 32, 32),
            ctx.save(),
            ctx.translate(16, 16),
            ctx.scale(.4, .4),
            redCell.drawOneCell(ctx),
            ctx.restore();
            var favicon = document.getElementById("favicon"),
                oldfavicon = favicon.cloneNode(true);
            oldfavicon.setAttribute("href", favCanvas.toDataURL("image/png"));
            favicon.parentNode.replaceChild(oldfavicon, favicon);
        }
        var redCell = new Cell(0, 0, 0, 32, "#ED1C24", ""),
            favCanvas = document.createElement("canvas");
        favCanvas.width = 32;
        favCanvas.height = 32;
        var ctx = favCanvas.getContext("2d");
        renderFavicon();
        // NOTE: This feature causes stuttering
        // Update icon color every 5 seconds
        setInterval(renderFavicon, 5e3);
    });*/
    if (document.readyState === 'complete') {
        gameLoop();
    } else {
        wHandle.addEventListener('load', gameLoop);
    }
})(window, window.jQuery);
