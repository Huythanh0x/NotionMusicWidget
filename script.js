$(function() {

    function encodePath(path) {
        return path.split('/').map(encodeURIComponent).join('/');
    }

    var baseUrl       = 'https://raw.githubusercontent.com/' + playerConfig.userName + '/' + playerConfig.repoName + '/refs/heads/' + playerConfig.branch + '/',
        songs         = playerConfig.songs,
        albums        = songs.map(function(s) { return s.album; }),
        trackNames    = songs.map(function(s) { return s.name; }),
        albumArtworks = songs.map(function(s, i) { return 'art_' + i; }),
        trackUrl      = songs.map(function(s) { return baseUrl + encodePath(s.audio); }),
        lyricsUrl     = songs.map(function(s) { return baseUrl + encodePath(s.audio.replace('.mp3', '.lrc')); }),
        secondaryLyricsUrl = songs.map(function(s) { return baseUrl + encodePath(s.audio.replace('.mp3', '-2nd.lrc')); });

    var playerTrack = $("#player-track"),
        bgArtwork = $('#bg-artwork'),
        bgArtworkUrl,
        albumName = $('#album-name'),
        trackName = $('#track-name'),
        trackNameSecondary = $('#track-name-secondary'),
        albumArt = $('#album-art'),
        sArea = $('#s-area'),
        seekBar = $('#seek-bar'),
        trackTime = $('#track-time'),
        insTime = $('#ins-time'),
        sHover = $('#s-hover'),
        playPauseButton = $("#play-pause-button"),
        i = playPauseButton.find('i'),
        tProgress = $('#current-time'),
        tTime = $('#track-length'),
        seekT, seekLoc, seekBarPos, cM,
        ctMinutes, ctSeconds,
        curMinutes, curSeconds,
        durMinutes, durSeconds,
        playProgress, bTime,
        nTime = 0,
        buffInterval = null,
        tFlag = false,
        playPreviousTrackButton = $('#play-previous'),
        playNextTrackButton = $('#play-next'),
        currIndex = -1,
        lrcData = null,
        lrcData2 = null,
        lrcIndex = 0;

    function parseLrc(text) {
        var lines = text.split('\n');
        var result = [];
        var re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
        lines.forEach(function(line) {
            var m = line.match(re);
            if (m) {
                var t = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
                result.push({ time: t, text: m[4].trim() });
            }
        });
        return result.sort(function(a, b) { return a.time - b.time; });
    }

    function getLrcIndex(data, ct) {
        var idx = 0;
        for (var li = 0; li < data.length; li++) {
            if (data[li].time <= ct) idx = li;
            else break;
        }
        return idx;
    }

    function resetLyricsDisplay(fallbackText) {
        trackName.stop(true, true).find('.lyric-text').stop(true, true);
        trackNameSecondary.stop(true, true).find('.lyric-text').stop(true, true);
        trackName.removeClass('lyric').html('').text(fallbackText).show();
        trackNameSecondary.removeClass('lyric').html('').hide();
    }

    function scrollLyricLine(container, lineDuration) {
        var span = container.find('.lyric-text');
        var overflow = span[0].offsetWidth - container[0].offsetWidth;
        if (overflow > 0) {
            var rightPadding = 44;
            var pauseMs = 400;
            var scrollMs = Math.max(lineDuration * 600 - pauseMs, 500);
            span.delay(pauseMs).animate({ marginLeft: -(overflow + rightPadding) }, scrollMs, 'linear');
        }
    }

    function showLyricLines(primaryText, secondaryText, lineDuration) {
        trackName.stop(true, true).fadeOut(120, function() {
            trackName.addClass('lyric')
                .html('<span class="lyric-text">' + $('<span>').text(primaryText).html() + '</span>')
                .fadeIn(200, function() {
                    scrollLyricLine(trackName, lineDuration);
                });
        });

        if (secondaryText) {
            trackNameSecondary.stop(true, true).fadeOut(120, function() {
                trackNameSecondary.addClass('lyric')
                    .html('<span class="lyric-text">' + $('<span>').text(secondaryText).html() + '</span>')
                    .fadeIn(200, function() {
                        scrollLyricLine(trackNameSecondary, lineDuration);
                    });
            });
        } else {
            trackNameSecondary.stop(true, true).removeClass('lyric').html('').hide();
        }
    }

    function fetchLyrics(index) {
        lrcData = null;
        lrcData2 = null;
        lrcIndex = 0;
        resetLyricsDisplay(trackNames[index]);

        $.ajax({
            url: lyricsUrl[index],
            dataType: 'text',
            success: function(data) {
                var parsed = parseLrc(data);
                lrcData = parsed.length ? parsed : null;
            },
            error: function() { lrcData = null; }
        });

        $.ajax({
            url: secondaryLyricsUrl[index],
            dataType: 'text',
            success: function(data) {
                var parsed = parseLrc(data);
                lrcData2 = parsed.length ? parsed : null;
            },
            error: function() { lrcData2 = null; }
        });
    }

    function playPause() {
        setTimeout(function() {
            if (audio.paused) {
                playerTrack.addClass('active');
                albumArt.addClass('active');
                checkBuffering();
                i.attr('class', 'fas fa-pause');
                audio.play();
            } else {
                playerTrack.removeClass('active');
                albumArt.removeClass('active');
                clearInterval(buffInterval);
                albumArt.removeClass('buffering');
                i.attr('class', 'fas fa-play');
                audio.pause();
            }
        }, 300);
    }

    function showHover(event) {
        seekBarPos = sArea.offset();
        seekT = event.clientX - seekBarPos.left;
        seekLoc = audio.duration * (seekT / sArea.outerWidth());

        sHover.width(seekT);

        cM = seekLoc / 60;
        ctMinutes = Math.floor(cM);
        ctSeconds = Math.floor(seekLoc - ctMinutes * 60);

        if ((ctMinutes < 0) || (ctSeconds < 0)) return;

        if (ctMinutes < 10) ctMinutes = '0' + ctMinutes;
        if (ctSeconds < 10) ctSeconds = '0' + ctSeconds;

        if (isNaN(ctMinutes) || isNaN(ctSeconds))
            insTime.text('--:--');
        else
            insTime.text(ctMinutes + ':' + ctSeconds);

        insTime.css({ 'left': seekT, 'margin-left': '-21px' }).fadeIn(0);
    }

    function hideHover() {
        sHover.width(0);
        insTime.text('00:00').css({ 'left': '0px', 'margin-left': '0px' }).fadeOut(0);
    }

    function playFromClickedPos() {
        audio.currentTime = seekLoc;
        seekBar.width(seekT);
        hideHover();
    }

    function updateCurrTime() {
        nTime = new Date();
        nTime = nTime.getTime();

        if (!tFlag) {
            tFlag = true;
            trackTime.addClass('active');
        }

        curMinutes = Math.floor(audio.currentTime / 60);
        curSeconds = Math.floor(audio.currentTime - curMinutes * 60);

        durMinutes = Math.floor(audio.duration / 60);
        durSeconds = Math.floor(audio.duration - durMinutes * 60);

        playProgress = (audio.currentTime / audio.duration) * 100;

        if (curMinutes < 10) curMinutes = '0' + curMinutes;
        if (curSeconds < 10) curSeconds = '0' + curSeconds;
        if (durMinutes < 10) durMinutes = '0' + durMinutes;
        if (durSeconds < 10) durSeconds = '0' + durSeconds;

        if (isNaN(curMinutes) || isNaN(curSeconds))
            tProgress.text('00:00');
        else
            tProgress.text(curMinutes + ':' + curSeconds);

        if (isNaN(durMinutes) || isNaN(durSeconds))
            tTime.text('00:00');
        else
            tTime.text(durMinutes + ':' + durSeconds);

        if (isNaN(curMinutes) || isNaN(curSeconds) || isNaN(durMinutes) || isNaN(durSeconds))
            trackTime.removeClass('active');
        else
            trackTime.addClass('active');

        seekBar.width(playProgress + '%');

        if (lrcData && lrcData.length > 0) {
            var ct = audio.currentTime;
            var newIdx = getLrcIndex(lrcData, ct);
            if (newIdx !== lrcIndex) {
                lrcIndex = newIdx;
                var newText = lrcData[lrcIndex].text;
                var secondaryText = null;
                if (lrcData2 && lrcData2.length > 0) {
                    secondaryText = lrcData2[getLrcIndex(lrcData2, ct)].text;
                }
                var nextTime = (lrcIndex + 1 < lrcData.length)
                    ? lrcData[lrcIndex + 1].time
                    : (audio.duration || lrcData[lrcIndex].time + 5);
                var lineDuration = Math.max(nextTime - lrcData[lrcIndex].time, 2);
                showLyricLines(newText, secondaryText, lineDuration);
            }
        }

        if (playProgress == 100) {
            i.attr('class', 'fa fa-play');
            seekBar.width(0);
            tProgress.text('00:00');
            albumArt.removeClass('buffering').removeClass('active');
            clearInterval(buffInterval);
        }
    }

    function checkBuffering() {
        clearInterval(buffInterval);
        buffInterval = setInterval(function() {
            if ((nTime == 0) || (bTime - nTime) > 1000)
                albumArt.addClass('buffering');
            else
                albumArt.removeClass('buffering');

            bTime = new Date();
            bTime = bTime.getTime();
        }, 100);
    }

    function selectTrack(flag) {
        if (flag == 0 || flag == 1)
            ++currIndex;
        else
            --currIndex;

        if ((currIndex > -1) && (currIndex < albumArtworks.length)) {
            if (flag == 0)
                i.attr('class', 'fa fa-play');
            else {
                albumArt.removeClass('buffering');
                i.attr('class', 'fa fa-pause');
            }

            seekBar.width(0);
            trackTime.removeClass('active');
            tProgress.text('00:00');
            tTime.text('00:00');

            currAlbum = albums[currIndex];
            currTrackName = trackNames[currIndex];
            currArtwork = albumArtworks[currIndex];

            audio.src = trackUrl[currIndex];

            nTime = 0;
            bTime = new Date();
            bTime = bTime.getTime();

            if (flag != 0) {
                audio.play();
                playerTrack.addClass('active');
                albumArt.addClass('active');
                clearInterval(buffInterval);
                checkBuffering();
            }

            albumName.text(currAlbum);
            fetchLyrics(currIndex);
            albumArt.find('img.active').removeClass('active');
            $('#' + currArtwork).addClass('active');

        } else {
            if (flag == 0 || flag == 1)
                --currIndex;
            else
                ++currIndex;
        }
    }

    function initPlayer() {
        audio = new Audio();

        songs.forEach(function(song, idx) {
            $('<img>')
                .attr('src', baseUrl + encodePath(song.artwork))
                .attr('id', albumArtworks[idx])
                .prependTo(albumArt);
        });
        albumArt.find('img').first().addClass('active');

        selectTrack(0);

        audio.loop = false;

        playPauseButton.on('click', playPause);

        sArea.mousemove(function(event) { showHover(event); });
        sArea.mouseout(hideHover);
        sArea.on('click', playFromClickedPos);

        $(audio).on('timeupdate', updateCurrTime);

        $(audio).on('ended', function() {
            clearInterval(buffInterval);
            albumArt.removeClass('buffering').removeClass('active');
            playerTrack.removeClass('active');
            i.attr('class', 'fas fa-play');
            seekBar.width(0);
            tProgress.text('00:00');
            tFlag = false;
            lrcData = null;
            lrcData2 = null;
            lrcIndex = 0;
            if (currIndex < albumArtworks.length - 1) {
                selectTrack(1);
            } else {
                currIndex = -1;
                selectTrack(1);
            }
        });

        playPreviousTrackButton.on('click', function() { selectTrack(-1); });
        playNextTrackButton.on('click', function() { selectTrack(1); });
    }

    initPlayer();
});
