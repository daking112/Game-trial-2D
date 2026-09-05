// ============================================================
// hud.js — chrome: top bar, hint pill, chapter card, end card
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
      <div id="hint"></div>
      <div id="chapter"><div class="num"></div><div class="rule"></div></div>
      <div id="endcard"><div class="big"></div><div class="small"></div></div>
      <div id="perf"></div>
    `);
    this.topbar = root.querySelector('#topbar');
    this.tbChapter = root.querySelector('#tb-chapter');
    this.tbRight = root.querySelector('#tb-right');
    this.hintEl = root.querySelector('#hint');
    this.chapterEl = root.querySelector('#chapter');
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

  /** Full-screen chapter card. Returns a promise resolving when it clears. */
  card(num, rule, { hold = 1.5, inDur = 0.9, outDur = 0.7 } = {}) {
    const el = this.chapterEl;
    el.querySelector('.num').textContent = num;
    el.querySelector('.rule').textContent = rule;
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'scale(1.06)';
    // force reflow
    void el.offsetWidth;
    el.style.transition = `opacity ${inDur}s cubic-bezier(.16,1,.3,1), transform ${inDur * 1.6}s cubic-bezier(.16,1,.3,1)`;
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
    return new Promise(res => {
      setTimeout(() => {
        el.style.transition = `opacity ${outDur}s cubic-bezier(.65,0,.35,1), transform ${outDur}s cubic-bezier(.65,0,.35,1)`;
        el.style.opacity = '0';
        el.style.transform = 'scale(0.97)';
        setTimeout(res, outDur * 1000);
      }, (inDur + hold) * 1000);
    });
  }

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
