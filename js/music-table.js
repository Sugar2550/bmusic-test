function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || url.split('/').pop();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function initMusicTable(options) {
  const { jsonUrl, hasPlaylist, tableContainerId } = options;

  let songs = [];
  const audio = new Audio();
  let playingIndex = null;
  const trackList = document.getElementById(tableContainerId);
  const searchInput = document.getElementById('search');
  const loopToggle = document.getElementById('loopToggle');

  if (loopToggle) {
    const savedLoop = localStorage.getItem('loopEnabled') === 'true';
    loopToggle.checked = savedLoop;
    audio.loop = savedLoop;
    loopToggle.addEventListener('change', () => {
      audio.loop = loopToggle.checked;
      localStorage.setItem('loopEnabled', loopToggle.checked);
    });
  }

  fetch(jsonUrl)
    .then(res => res.json())
    .then(data => { songs = data; renderList(''); })
    .catch(err => {
      console.error('JSON読み込みエラー:', err);
      trackList.innerHTML = '<p style="text-align:center;">曲リストを読み込めませんでした。ページを再読み込みしてください。</p>';
    });

  function isSameTrack(index) {
    return audio.src === new URL(songs[index].file, location.href).href;
  }

  function renderList(filter = '') {
    const q = filter.toLowerCase();
    const colCount = hasPlaylist ? 5 : 4;
    let html = `
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="song-title">曲名</th>
            <th>再生</th>
            <th>ダウンロード</th>
            ${hasPlaylist ? '<th>プレイリスト</th>' : ''}
            <th>追加Ver.</th>
          </tr>
        </thead>
        <tbody>`;

    let count = 0;
    songs.forEach((track, i) => {
      if (!track.title.toLowerCase().includes(q)) return;
      count++;
      const isPlaying = playingIndex === i && !audio.paused;
      html += `
        <tr class="${playingIndex === i ? 'playing' : ''}">
          <td class="song-title">${escapeHtml(track.title)}</td>
          <td class="col-btn"><button class="simple-btn primary" data-action="play" data-index="${i}">${isPlaying ? '⏸ 停止' : '▶ 再生'}</button></td>
          <td class="col-btn"><button class="simple-btn" data-action="download" data-index="${i}">⬇ 保存</button></td>
          ${hasPlaylist ? `<td class="col-btn"><button class="simple-btn" data-action="add" data-index="${i}">＋ 追加</button></td>` : ''}
          <td class="col-ver ${track.version ? '' : 'none'}">${track.version ? escapeHtml(track.version) : '-'}</td>
        </tr>`;
    });

    if (count === 0) {
      html += `<tr><td class="empty-row" colspan="${colCount}">該当する曲がありません</td></tr>`;
    }
    html += '</tbody></table></div>';
    trackList.innerHTML = html;
  }

  // ボタンはイベント委譲で処理 (再描画しても付け直し不要)
  trackList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    switch (btn.dataset.action) {
      case 'play': togglePlay(i); break;
      case 'download': downloadFile(songs[i].file, songs[i].title); break;
      case 'add': window.addToPlaylist(i); break;
    }
  });

  function togglePlay(index) {
    audio.loop = !!(loopToggle && loopToggle.checked);
    if (!isSameTrack(index)) {
      audio.src = songs[index].file;
      audio.play();
    } else if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
    playingIndex = index;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: songs[index].title,
        artist: '',
        album: '',
        artwork: [{ src: songs[index].artwork || '/images/default.png', sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    }
  }

  window.addToPlaylist = function (index) {
    const playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
    playlist.push(songs[index]);
    localStorage.setItem('playlist', JSON.stringify(playlist));
    alert('プレイリストに追加しました！');
  };

  // 再生状態が変わるたびに表示を更新 (メディアキーでの操作にも追従)
  ['play', 'pause'].forEach(ev => audio.addEventListener(ev, () => renderList(searchInput.value)));
  audio.addEventListener('ended', () => {
    if (!audio.loop) {
      playingIndex = null;
      renderList(searchInput.value);
    }
  });

  searchInput.addEventListener('input', e => renderList(e.target.value));

  // --- 下部プレイヤー ---
  const seekBar = document.getElementById('seek-bar');
  const currentTimeEl = document.getElementById('current-time');
  const durationEl = document.getElementById('duration');
  const nowPlayingEl = document.getElementById('now-playing');
  let isSeeking = false;

  function formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  if (seekBar) {
    audio.addEventListener('loadedmetadata', () => {
      durationEl.textContent = formatTime(audio.duration);
      seekBar.max = audio.duration;
    });
    audio.addEventListener('timeupdate', () => {
      if (!isSeeking) {
        seekBar.value = audio.currentTime;
        currentTimeEl.textContent = formatTime(audio.currentTime);
      }
    });
    seekBar.addEventListener('input', () => {
      isSeeking = true;
      currentTimeEl.textContent = formatTime(seekBar.value);
    });
    seekBar.addEventListener('change', () => {
      audio.currentTime = seekBar.value;
      isSeeking = false;
    });
    const updateNowPlaying = () => {
      if (playingIndex !== null && songs[playingIndex]) {
        nowPlayingEl.textContent = (audio.paused ? '一時停止中: ' : '再生中: ') + songs[playingIndex].title;
      }
    };
    audio.addEventListener('play', updateNowPlaying);
    audio.addEventListener('pause', updateNowPlaying);
  }
}
