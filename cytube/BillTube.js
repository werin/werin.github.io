$(document).ready(function() {
    // Initialize cast variables
    var session = null;
    var castPlayer = null;
    var CHECK_INTERVAL = 120000; // Sync every 120 seconds
    var SYNC_THRESHOLD = 20; // Sync if time difference is more than 20 seconds
    var player = null;
    var castAvailable = false; // Flag to check if Cast API is available
    var syncInterval = null; // To store the synchronization interval ID

    // Function to check if casting is available
    function checkCastingAvailability() {
        return new Promise((resolve) => {
            if (!chrome || !chrome.cast || !chrome.cast.isAvailable) {
                resolve(false);
            } else {
                chrome.cast.initialize(
                    new chrome.cast.ApiConfig(
                        new chrome.cast.SessionRequest(chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID),
                        sessionListener,
                        receiverListener
                    ),
                    () => resolve(true),
                    () => resolve(false)
                );
            }
        });
    }

    // Function to initialize the Video.js player
    function initializePlayer() {
        if ($('#ytapiplayer').length) {
            player = videojs('ytapiplayer');
            attachPlayerEventListeners();
            updateCastButtonVisibility();
        } else {
            setTimeout(initializePlayer, 500);
        }
    }

    // Function to initialize the cast button
    function initializeCastButton() {
        if ($('#VideoOverlay').length && castAvailable) {
            createCastButton();
            updateCastButtonVisibility();
        } else if (!castAvailable) {
            createFallbackButton();
        } else {
            setTimeout(initializeCastButton, 500);
        }
    }

    // Function to create a fallback button for users without cast support
    function createFallbackButton() {
        if ($('#fallbackButton').length) return;

        var fallbackButton = $('<button id="fallbackButton" class="fal fa-regular fa-info-circle OLB" style="z-index: 1000; float: right;" data-tooltip-pos="down" data-tooltip="Casting Not Available"></button>');
        $('#VideoOverlay').append(fallbackButton);

        fallbackButton.on('click', function() {
            alert('Casting is not available on your browser. Please use Google Chrome for casting functionality.');
        });
    }

    // Function to attach event listeners to the player
    function attachPlayerEventListeners() {
        if (!player) return;

        player.on('play', function() {
            if (session && castPlayer && castPlayer.playerState !== chrome.cast.media.PlayerState.PLAYING) {
                castPlayer.play(
                    function() { console.log('Cast player resumed'); },
                    function(error) { console.error('Error playing cast player:', error); }
                );
            }
        });

        player.on('pause', function() {
            if (session && castPlayer && castPlayer.playerState !== chrome.cast.media.PlayerState.PAUSED) {
                castPlayer.pause(
                    function(error) { console.error('Error pausing cast player:', error); }
                );
            }
        });

        player.on('seeked', function() {
            console.log('Player triggered seeked event.');
            if (session && castPlayer) {
                var currentTime = player.currentTime();
                console.log(`Seeking... Setting Chromecast to time: ${currentTime}`);

                if (castPlayer && castPlayer.sessionId === session.getSessionId()) {
                    var seekRequest = new chrome.cast.media.SeekRequest();
                    seekRequest.currentTime = currentTime;
                    castPlayer.seek(seekRequest,
                        function() { console.log('Cast player synced after seek'); },
                        function(error) { console.error('Error syncing cast player after seek:', error); }
                    );
                } else {
                    console.error('Cannot seek: Invalid cast player session.');
                }
            }
        });

        player.on('loadstart', function() {
            console.log('Video.js player is loading a new source.');
            stopSync();
        });

        player.on('loadeddata', function() {
            console.log('Video.js player has loaded data.');
            startSync();
            if (session) {
                castCurrentVideo(0);
            }
            updateCastButtonVisibility();
        });
    }

// ... [continued from Part 1]

    // Function to create the cast button and append it to the VideoOverlay div
    function createCastButton() {
        if ($('#castButton').length) {
            console.log('Cast button already exists.');
            return;
        }

        var castButton = $('<button id="castButton" class="fal fa-regular fa-screencast OLB" style="z-index: 1000; float: left; display: none;" data-tooltip-pos="down" data-tooltip="Google Cast"></button>');

        $('#VideoOverlay').append(castButton);
        console.log('Cast button created and appended.');

        castButton.on('click', function() {
            console.log('Cast button clicked.');
            cast.framework.CastContext.getInstance().requestSession();
        });
    }

    // Function to update the visibility of the cast button based on video src
    function updateCastButtonVisibility() {
        var videoSrc = getCurrentVideoSrc();

        var isYouTubeVideo = videoSrc ? videoSrc.toLowerCase().includes('youtube') : false;

        if (isYouTubeVideo) {
            $('#castButton, #fallbackButton').css('display', 'none');
            if (session) {
                stopSync();
            }
        } else if (castAvailable) {
            $('#castButton').css('display', 'block');
            $('#fallbackButton').css('display', 'none');
            if (session && !syncInterval) {
                startSync();
            }
        } else {
            $('#castButton').css('display', 'none');
            $('#fallbackButton').css('display', 'block');
        }
    }

    // Function to initialize the cast framework
    function initializeCastApi() {
        castAvailable = true;
        var context = cast.framework.CastContext.getInstance();
        context.setOptions({
            receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });

        console.log('Cast API initialized.');

        context.addEventListener(
            cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            sessionStateChanged
        );

        initializeCastButton();
    }

    // Function to handle session state changes
    function sessionStateChanged(event) {
        switch (event.sessionState) {
            case cast.framework.SessionState.SESSION_STARTED:
            case cast.framework.SessionState.SESSION_RESUMED:
                session = cast.framework.CastContext.getInstance().getCurrentSession();

                if (session) {
                    castPlayer = session.getMediaSession();
                }

                waitForPlayer(function() {
                    var currentTime = 0;
                    if (player && typeof player.currentTime === 'function') {
                        currentTime = player.currentTime();
                    }
                    castCurrentVideo(currentTime);
                });

                startSync();
                break;
            case cast.framework.SessionState.SESSION_ENDED:
                session = null;
                castPlayer = null;
                stopSync();
                break;
            default:
        }
    }

    // Function to wait for the player to be initialized
    function waitForPlayer(callback) {
        if (player) {
            callback();
        } else {
            setTimeout(function() {
                waitForPlayer(callback);
            }, 500);
        }
    }

    // Function to get the current video source
    function getCurrentVideoSrc() {
        var videoElement = $('#ytapiplayer video');
        var iframeElement = $('#ytapiplayer iframe');
        var videoSrc = null;

        if (videoElement.length > 0) {
            videoSrc = videoElement.attr('src');
            if (!videoSrc) {
                var sourceElements = videoElement.find('source');
                sourceElements.each(function() {
                    var src = $(this).attr('src');
                    if (src) {
                        videoSrc = src;
                        return false;
                    }
                });
            }
            if (!videoSrc) {
                videoSrc = videoElement.attr('data-src');
            }
        }

        if (!videoSrc && iframeElement.length > 0) {
            videoSrc = iframeElement.attr('src');
        }

        if (!videoSrc) {
            console.error('Unable to get current video source from ytapiplayer.');
        }
        return videoSrc;
    }

    // Function to cast the current video
    function castCurrentVideo(currentTime) {
        if (session) {
            var videoSrc = getCurrentVideoSrc();
            if (!videoSrc) {
                console.error('Cannot cast video: Video source not found.');
                return;
            }

            var isYouTubeVideo = videoSrc.toLowerCase().includes('youtube');
            if (isYouTubeVideo) {
                return;
            }

            var mimeType = getMimeType(videoSrc);
            var mediaInfo = new chrome.cast.media.MediaInfo(videoSrc, mimeType);

            var videoName = $('#currenttitle').text() || 'Unknown Title';
            var fullTitle = 'BillTube Cast: ' + videoName;

            var metadata = new chrome.cast.media.GenericMediaMetadata();
            metadata.title = fullTitle;
            mediaInfo.metadata = metadata;

            var request = new chrome.cast.media.LoadRequest(mediaInfo);
            request.currentTime = currentTime;
            request.autoplay = true;

            session.loadMedia(request).then(
                function() {
                    castPlayer = session.getMediaSession();
                    updateCastButtonVisibility();
                },
                function(error) {
                    console.error('Error loading media:', error);
                }
            );
        } else {
        }
    }

    // Helper function to determine MIME type based on file extension
    function getMimeType(url) {
        var extension = url.split('.').pop().split(/\#|\?/)[0].toLowerCase();
        switch (extension) {
            case 'mp4': return 'video/mp4';
            case 'webm': return 'video/webm';
            case 'ogg': case 'ogv': return 'video/ogg';
            case 'mov': return 'video/quicktime';
            default:
                console.warn('Unknown video extension. Defaulting to video/mp4');
                return 'video/mp4';
        }
    }

    // Sync playback time periodically
    function startSync() {
        if (!syncInterval) {
            syncInterval = setInterval(syncPlaybackTime, CHECK_INTERVAL);
        }
    }

    function stopSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    function syncPlaybackTime() {
        if (session && castPlayer && player && typeof player.currentTime === 'function') {
            var localTime = player.currentTime();
            var startTime = Date.now();
            castPlayer.getStatus(null, function(status) {
                var endTime = Date.now();
                var latency = (endTime - startTime) / 2000; // Convert to seconds
                var castTime = status.currentTime + latency;

                console.log(`Sync Check - Local Time: ${localTime}, Cast Time: ${castTime}, Latency: ${latency}`);

                if (Math.abs(localTime - castTime) > SYNC_THRESHOLD) {
                    console.log(`Difference exceeds threshold. Syncing...`);
                    if (castPlayer && castPlayer.sessionId === session.getSessionId()) {
                        var seekRequest = new chrome.cast.media.SeekRequest();
                        seekRequest.currentTime = localTime;

                        castPlayer.seek(seekRequest,
                            function() { console.log('Cast player synced to local player'); },
                            function(error) { console.error('Error syncing cast player:', error); }
                        );
                    } else {
                        console.error('Cannot sync: Invalid cast player session.');
                        stopSync();
                    }
                } else {
                }
            });
        } else {
            stopSync();
        }
    }

    // Handle the socket event for media change
    socket.on("changeMedia", function() {

        waitForYtapiplayer(function() {
            initializePlayer();

            player.ready(function() {

                if (session) {
                    castCurrentVideo(0);
                } else {
                }

                updateCastButtonVisibility();
            });
        });
    });

    // Function to wait for ytapiplayer to be available
    function waitForYtapiplayer(callback) {
        if ($('#ytapiplayer').length > 0) {
            callback();
        } else {
            setTimeout(function() {
                waitForYtapiplayer(callback);
            }, 5000);
        }
    }

    // Load the Google Cast SDK dynamically
    var castScript = document.createElement('script');
    castScript.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    document.head.appendChild(castScript);

    // Initialize the cast framework when available
    window['__onGCastApiAvailable'] = function(isAvailable) {
        if (isAvailable) {
            initializeCastApi();
        } else {
            castAvailable = false;
        }
    };

    // Cleanup when the page is unloaded
    $(window).on('beforeunload', function() {
        if (session) {
            session.endSession(true);
        }
    });

    // Main execution
    checkCastingAvailability().then((isAvailable) => {
        castAvailable = isAvailable;
        if (isAvailable) {
            initializeCastApi();
        } else {
        }
        initializePlayer();
        initializeCastButton();
    });
});
