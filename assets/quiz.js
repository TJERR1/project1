/* Product Thinking course: quiz and reveal components.

   Quiz usage:
     <div class="quiz">
       <script type="application/json">
       { "questions": [
           { "prompt": "...", "options": ["A", "B"], "answer": 0, "feedback": "..." }
       ] }
       </script>
     </div>
   Options render in the order given. Keep options equal in length so
   formatting gives no clue. "answer" is the index of the correct option.

   Reveal usage:
     <div class="reveal">
       <button type="button" data-label="Reveal model answer"></button>
       <div class="reveal-body">...</div>
     </div>
*/
(function () {
  function renderQuiz(root) {
    var dataEl = root.querySelector('script[type="application/json"]');
    if (!dataEl) return;
    var data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      root.textContent = 'Quiz data could not be read.';
      return;
    }
    var qs = data.questions || [];
    var score = 0;
    var answered = 0;

    var scoreEl = document.createElement('div');
    scoreEl.className = 'quiz-score';

    qs.forEach(function (q, i) {
      var wrap = document.createElement('div');
      wrap.className = 'quiz-q';

      var prompt = document.createElement('div');
      prompt.className = 'quiz-prompt';
      var num = document.createElement('span');
      num.className = 'qnum';
      num.textContent = (i + 1) + ' / ' + qs.length;
      prompt.appendChild(num);
      prompt.appendChild(document.createTextNode(q.prompt));
      wrap.appendChild(prompt);

      var opts = document.createElement('div');
      opts.className = 'quiz-options';
      var buttons = [];
      q.options.forEach(function (label, idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', function () {
          var right = idx === q.answer;
          buttons.forEach(function (bb) { bb.disabled = true; });
          b.classList.add(right ? 'chosen-right' : 'chosen-wrong');
          if (!right) buttons[q.answer].classList.add('reveal-right');
          var fb = document.createElement('div');
          fb.className = 'quiz-feedback ' + (right ? 'right' : 'wrong');
          fb.textContent = (right ? 'Correct. ' : 'Not quite. ') + (q.feedback || '');
          wrap.appendChild(fb);
          answered++;
          if (right) score++;
          var text = 'Score: ' + score + ' / ' + answered;
          if (answered === qs.length) {
            text += '.';
            var P = window.PTProgress;
            var sum = P ? P.recordQuiz({ type: 'quiz', lessonId: P.currentLessonId(), correct: score, total: qs.length }) : null;
            if (sum) {
              text += sum.xpEarned > 0 ? ' +' + sum.xpEarned + ' XP.' : ' Already counted today.';
              text += ' Streak: ' + sum.streak + (sum.streak === 1 ? ' day.' : ' days.');
            }
            text += score === qs.length
              ? ' Clean sweep.'
              : ' Re-read the misses, then come back tomorrow and try again from memory.';
          }
          scoreEl.textContent = text;
        });
        buttons.push(b);
        opts.appendChild(b);
      });
      wrap.appendChild(opts);
      root.appendChild(wrap);
    });
    root.appendChild(scoreEl);
  }

  /* The textarea paired with a reveal is the nearest one before it in
     document order. Its id is the XP task id. */
  function pairedTextarea(el) {
    var all = document.querySelectorAll('textarea'), found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = all[i];
    }
    return found;
  }

  function wireReveal(el) {
    var btn = el.querySelector('button');
    if (!btn) return;
    var label = btn.getAttribute('data-label') || btn.textContent || 'Reveal';
    btn.textContent = label;
    btn.addEventListener('click', function () {
      var opening = !el.classList.contains('open');
      el.classList.toggle('open');
      btn.textContent = el.classList.contains('open') ? 'Hide' : label;
      var P = window.PTProgress;
      if (!opening || !P) return;
      var ta = pairedTextarea(el);
      if (!ta || !ta.id || ta.value.replace(/\s/g, '').length < P.MIN_REWRITE_CHARS) return;
      var sum = P.recordRewrite({ type: 'rewrite', lessonId: P.currentLessonId(), taskId: ta.id });
      if (sum && sum.xpEarned > 0) {
        var line = document.createElement('p');
        line.className = 'xp-award';
        line.textContent = '+' + sum.xpEarned + ' XP for attempting this before revealing.';
        el.querySelector('.reveal-body').appendChild(line);
      }
    });
  }

  function init() {
    document.querySelectorAll('.quiz').forEach(renderQuiz);
    document.querySelectorAll('.reveal').forEach(wireReveal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
