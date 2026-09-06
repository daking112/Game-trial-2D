// ============================================================
// hud.js — chrome: top bar, hint, end card.
// The chapter card used to live here. A chapter is now announced by its
// label going up on the plinth and the lamp coming on over it — the room
// is the transition, which is what the design always said it was.
// ============================================================
import { Ease } from '../core/math.js';

export class Hud {
  constructor(root) {
    this.root = root;
    root.insertAdjacentHTML('beforeend', `
      <div class="topbar" id="topbar">
        <div class="chapter" id="tb-chapter"></div>
        <div class="title">Don't Touch It</div>
        <div class="chapter" id="tb-right"></div>
      </div>
      <div id="hint"></div><div class="rule"></div></div>
      <div id="endcard"><div class="big"></div><div class="small"></div></div>
      <div id="perf"></div>
    `);
    this.topbar = root.querySelector('#topbar');
    this.tbChapter = root.querySelector('#tb-chapter');
    this.tbRight = root.querySelector('#tb-right');
    this.hintEl = root.querySelector('#hint');
    this.endEl = root.querySelector('#endcard');
    this.perfEl = root.querySelector('#perf');
    this._hintT = 0;
  }

  setChapter(n, total) {
    this.tbChapter.textContent = `${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  }
  setRight(txt) { this.tbRight.textContent = txt || ''; }
  showBar(on) { this.topbar.classList.toggle('on', !!on); }

  hint(text) {
    if (!text) { this.hintEl.classList.remove('on'); return; }
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
  }
  hideHint() { this.hintEl.classList.remove('on'); }

  /**
   * end(big, lines, onAgain)
   * `lines` is a short list of facts about THIS playthrough — what the
   * player actually did — because a generic score card is the one place
   * a game like this can't afford to stop being specific.
   */
  end(big, lines, onAgain) {
    const b = this.endEl.querySelector('.big');
    const sm = this.endEl.querySelector('.small');
    b.textContent = big;
    sm.innerHTML = (lines || []).map(l => `<span>${l}</span>`).join('');
    let again = this.endEl.querySelector('.again');
    if (!again) {
      again = document.createElement('button');
      again.className = 'again';
      again.type = 'button';
      this.endEl.appendChild(again);
    }
    again.textContent = 'Begin again';
    again.onclick = () => onAgain && onAgain();
    this.endEl.style.transition = 'opacity 1.8s cubic-bezier(.16,1,.3,1)';
    this.endEl.style.opacity = '1';
    this.endEl.style.pointerEvents = 'auto';
    // the button arrives late, so the last line has time to land
    again.style.opacity = '0';
    setTimeout(() => {
      again.style.transition = 'opacity 1.2s cubic-bezier(.16,1,.3,1)';
      again.style.opacity = '1';
    }, 2600);
  }
}
