(function () {
  'use strict';

  var SUPABASE_URL = 'https://rnyeonvbnrwephpviyzu.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJueWVvbnZibnJ3ZXBocHZpeXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NzQzMTYsImV4cCI6MjA5ODA1MDMxNn0.B5Rz3enTmtMsQ6SONysjdqth5LDdOa2f3ilLN5eBBok';

  var REVIEWER_ID_KEY = 'deck-delta-reviewer-id';
  var REVIEWER_NAME_KEY = 'deck-delta-reviewer-name';
  var FILTER_KEY = 'deck-delta-copy-filter';

  var supabase = null;

  function getSupabase() {
    if (supabase) return supabase;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('Supabase SDK not loaded — review sync disabled.');
      return null;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabase;
  }

  var state = {
    decisions: [],
    comments: [],
    filter: 'all',
    reviewerId: null,
    reviewerName: null,
    pendingAction: null,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch (_e) {
      return '';
    }
  }

  function getReviewerId() {
    var id = localStorage.getItem(REVIEWER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(REVIEWER_ID_KEY, id);
    }
    return id;
  }

  function getReviewerName() {
    try {
      return localStorage.getItem(REVIEWER_NAME_KEY) || sessionStorage.getItem(REVIEWER_NAME_KEY) || '';
    } catch (e) {
      return sessionStorage.getItem(REVIEWER_NAME_KEY) || '';
    }
  }

  function setReviewerName(name) {
    var trimmed = name.trim();
    try {
      localStorage.setItem(REVIEWER_NAME_KEY, trimmed);
    } catch (e) {
      try {
        sessionStorage.setItem(REVIEWER_NAME_KEY, trimmed);
      } catch (_e2) {}
    }
    state.reviewerName = trimmed;
    var badge = $('#reviewer-badge');
    if (badge) {
      badge.textContent = state.reviewerName;
      badge.classList.remove('is-empty');
    }
  }

  function ensureReviewer(action) {
    if (state.reviewerName) {
      return Promise.resolve(state.reviewerName);
    }
    return new Promise(function (resolve) {
      state.pendingAction = { resolve: resolve, action: action };
      openNameModal();
    });
  }

  function openNameModal() {
    var modal = $('#name-modal');
    var input = $('#name-modal-input');
    var err = $('#name-modal-error');
    if (!modal || !input) return;
    modal.hidden = false;
    modal.classList.add('is-open');
    if (err) err.textContent = '';
    input.value = state.reviewerName || '';
    window.setTimeout(function () {
      input.focus();
      input.select();
    }, 50);
  }

  function closeNameModal() {
    var modal = $('#name-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    var err = $('#name-modal-error');
    if (err) err.textContent = '';
  }

  function completeNameModal() {
    var input = $('#name-modal-input');
    var err = $('#name-modal-error');
    var name = input ? input.value.trim() : '';
    if (name.length < 2) {
      if (err) err.textContent = 'Please enter at least 2 characters.';
      if (input) input.focus();
      return false;
    }
    setReviewerName(name);
    closeNameModal();
    if (state.pendingAction) {
      var resolve = state.pendingAction.resolve;
      state.pendingAction = null;
      resolve(name);
    }
    return true;
  }

  function decisionsForItem(itemId) {
    return state.decisions.filter(function (d) {
      return d.item_id === itemId;
    });
  }

  function commentsForItem(itemId) {
    return state.comments.filter(function (c) {
      return c.item_id === itemId;
    });
  }

  function myDecision(itemId) {
    return state.decisions.find(function (d) {
      return d.item_id === itemId && d.reviewer_id === state.reviewerId;
    });
  }

  function itemSummary(itemId) {
    var decisions = decisionsForItem(itemId);
    var approved = decisions.filter(function (d) {
      return d.status === 'approved';
    }).length;
    var rejected = decisions.filter(function (d) {
      return d.status === 'rejected';
    }).length;
    var comments = commentsForItem(itemId).length;
    return { approved: approved, rejected: rejected, comments: comments, total: decisions.length };
  }

  function matchesFilter(itemId) {
    var summary = itemSummary(itemId);
    if (state.filter === 'all') return true;
    if (state.filter === 'approved') return summary.approved > 0;
    if (state.filter === 'rejected') return summary.rejected > 0;
    if (state.filter === 'pending') return summary.total === 0;
    if (state.filter === 'commented') return summary.comments > 0;
    return true;
  }

  function applyFilter() {
    $all('.proposal-card').forEach(function (card) {
      var itemId = card.dataset.itemId;
      var visible = matchesFilter(itemId);
      card.classList.toggle('is-filtered-out', !visible);
    });
    updateFilterCounts();
  }

  function updateFilterCounts() {
    var counts = { all: 0, approved: 0, rejected: 0, pending: 0, commented: 0 };
    $all('.proposal-card').forEach(function (card) {
      var itemId = card.dataset.itemId;
      var summary = itemSummary(itemId);
      counts.all += 1;
      if (summary.approved > 0) counts.approved += 1;
      if (summary.rejected > 0) counts.rejected += 1;
      if (summary.total === 0) counts.pending += 1;
      if (summary.comments > 0) counts.commented += 1;
    });
    $all('[data-filter-count]').forEach(function (el) {
      var key = el.getAttribute('data-filter-count');
      if (counts[key] !== undefined) el.textContent = String(counts[key]);
    });
  }

  function renderCardChrome(card) {
    var itemId = card.dataset.itemId;
    if (!itemId || card.dataset.reviewReady) return;
    card.dataset.reviewReady = '1';
    card.classList.add('proposal-card');

    var toolbar = document.createElement('div');
    toolbar.className = 'review-toolbar';
    toolbar.innerHTML =
      '<div class="review-toolbar-left">' +
      '  <span class="review-label">Review</span>' +
      '  <span class="consensus-strip" data-consensus></span>' +
      '</div>' +
      '<div class="review-actions">' +
      '  <button type="button" class="vote-btn vote-approve" data-vote="approved" title="Approve" aria-label="Approve">' +
      '    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.2 7.2a1 1 0 0 1-1.4 0l-3.6-3.6a1 1 0 1 1 1.4-1.4l2.9 2.9 6.5-6.5a1 1 0 0 1 1.4 0z"/></svg>' +
      '  </button>' +
      '  <button type="button" class="vote-btn vote-reject" data-vote="rejected" title="Reject" aria-label="Reject">' +
      '    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4z"/></svg>' +
      '  </button>' +
      '  <button type="button" class="comment-toggle" title="Comment" aria-label="Comment">' +
      '    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v6A2.5 2.5 0 0 1 14.5 13H8.7L4.8 16.2A1 1 0 0 1 3 15.4V4.5z"/></svg>' +
      '  </button>' +
      '</div>';

    var panel = document.createElement('div');
    panel.className = 'review-panel';
    panel.innerHTML =
      '<div class="review-panel-head">' +
      '  <p class="review-panel-title">Comments</p>' +
      '  <p class="review-panel-hint">Team feedback on this proposal</p>' +
      '</div>' +
      '<div class="comments-list" data-comments></div>' +
      '<div class="comment-compose">' +
      '  <textarea rows="2" placeholder="Add a comment…" data-comment-input></textarea>' +
      '  <button type="button" class="comment-submit" data-comment-submit>Post comment</button>' +
      '</div>';

    card.insertBefore(toolbar, card.firstChild);
    card.appendChild(panel);

    toolbar.querySelector('[data-vote="approved"]').addEventListener('click', function () {
      setDecision(itemId, 'approved');
    });
    toolbar.querySelector('[data-vote="rejected"]').addEventListener('click', function () {
      setDecision(itemId, 'rejected');
    });
    toolbar.querySelector('.comment-toggle').addEventListener('click', function () {
      card.classList.toggle('comments-open');
      var input = panel.querySelector('[data-comment-input]');
      if (card.classList.contains('comments-open') && input) input.focus();
    });
    panel.querySelector('[data-comment-submit]').addEventListener('click', function () {
      submitComment(itemId, panel);
    });
    panel.querySelector('[data-comment-input]').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitComment(itemId, panel);
      }
    });

    card.addEventListener('mouseenter', function () {
      card.classList.add('is-hovered');
    });
    card.addEventListener('mouseleave', function () {
      card.classList.remove('is-hovered');
      if (!card.classList.contains('comments-open')) return;
    });
  }

  function renderAllCards() {
    $all('.proposal-card').forEach(renderCardState);
    applyFilter();
  }

  function renderCardState(card) {
    var itemId = card.dataset.itemId;
    var mine = myDecision(itemId);
    var summary = itemSummary(itemId);

    var approveBtn = card.querySelector('[data-vote="approved"]');
    var rejectBtn = card.querySelector('[data-vote="rejected"]');
    if (approveBtn) {
      approveBtn.classList.toggle('is-selected', mine && mine.status === 'approved');
      approveBtn.setAttribute('aria-pressed', mine && mine.status === 'approved' ? 'true' : 'false');
      approveBtn.title = mine && mine.status === 'approved' ? 'Approved · click again to clear' : 'Approve';
    }
    if (rejectBtn) {
      rejectBtn.classList.toggle('is-selected', mine && mine.status === 'rejected');
      rejectBtn.setAttribute('aria-pressed', mine && mine.status === 'rejected' ? 'true' : 'false');
      rejectBtn.title = mine && mine.status === 'rejected' ? 'Rejected · click again to clear' : 'Reject';
    }

    card.classList.toggle('is-approved', summary.approved > 0 && summary.rejected === 0);
    card.classList.toggle('is-rejected', summary.rejected > 0 && summary.approved === 0);
    card.classList.toggle('is-split', summary.approved > 0 && summary.rejected > 0);
    card.classList.toggle('has-comments', summary.comments > 0);

    var consensus = card.querySelector('[data-consensus]');
    if (consensus) {
      var bits = [];
      if (summary.approved) bits.push('<span class="pill pill-approved">' + summary.approved + ' approved</span>');
      if (summary.rejected) bits.push('<span class="pill pill-rejected">' + summary.rejected + ' rejected</span>');
      if (summary.comments) bits.push('<span class="pill pill-comment">' + summary.comments + ' comment' + (summary.comments === 1 ? '' : 's') + '</span>');
      consensus.innerHTML = bits.length ? bits.join('') : '<span class="pill pill-pending">No votes yet</span>';
    }

    var list = card.querySelector('[data-comments]');
    if (list) {
      var comments = commentsForItem(itemId);
      if (!comments.length) {
        list.innerHTML = '<p class="comments-empty">No comments yet — add one below.</p>';
      } else {
        list.innerHTML = comments
          .map(function (c) {
            return (
              '<article class="comment-block">' +
              '<p class="comment-author">' +
              escapeHtml(c.reviewer_name) +
              '<span class="comment-time">' +
              escapeHtml(formatTime(c.created_at)) +
              '</span></p>' +
              '<p class="comment-body">' +
              escapeHtml(c.body) +
              '</p></article>'
            );
          })
          .join('');
      }
    }
  }

  function setDecision(itemId, status) {
    ensureReviewer('vote').then(function () {
      var client = getSupabase();
      if (!client) return;

      var existing = myDecision(itemId);
      var nextStatus = existing && existing.status === status ? null : status;

      if (!nextStatus) {
        if (!existing) return;
        client
          .from('deck_review_decisions')
          .delete()
          .eq('item_id', itemId)
          .eq('reviewer_id', state.reviewerId)
          .then(function () {
            state.decisions = state.decisions.filter(function (d) {
              return !(d.item_id === itemId && d.reviewer_id === state.reviewerId);
            });
            renderAllCards();
          });
        return;
      }

      client
        .from('deck_review_decisions')
        .upsert(
          {
            item_id: itemId,
            reviewer_id: state.reviewerId,
            reviewer_name: state.reviewerName,
            status: nextStatus,
          },
          { onConflict: 'item_id,reviewer_id' }
        )
        .then(function (res) {
          if (res.error) {
            console.error(res.error);
            return;
          }
          loadData().then(renderAllCards);
        });
    });
  }

  function submitComment(itemId, panel) {
    var input = panel.querySelector('[data-comment-input]');
    var body = input ? input.value.trim() : '';
    if (!body) return;

    ensureReviewer('comment').then(function () {
      var client = getSupabase();
      if (!client) return;

      client
        .from('deck_review_comments')
        .insert({
          item_id: itemId,
          reviewer_id: state.reviewerId,
          reviewer_name: state.reviewerName,
          body: body,
        })
        .then(function (res) {
          if (res.error) {
            console.error(res.error);
            return;
          }
          if (input) input.value = '';
          var card = panel.closest('.proposal-card');
          if (card) card.classList.add('comments-open');
          loadData().then(renderAllCards);
        });
    });
  }

  function loadData() {
    var client = getSupabase();
    if (!client) {
      state.decisions = [];
      state.comments = [];
      return Promise.resolve();
    }
    return Promise.all([
      client.from('deck_review_decisions').select('*').order('updated_at', { ascending: false }),
      client.from('deck_review_comments').select('*').order('created_at', { ascending: true }),
    ]).then(function (results) {
      if (results[0].error) console.error(results[0].error);
      if (results[1].error) console.error(results[1].error);
      state.decisions = results[0].data || [];
      state.comments = results[1].data || [];
    });
  }

  function initFilters() {
    var saved = localStorage.getItem(FILTER_KEY);
    if (saved) state.filter = saved;

    $all('.filter-btn').forEach(function (btn) {
      var value = btn.getAttribute('data-filter');
      btn.classList.toggle('is-active', value === state.filter);
      btn.addEventListener('click', function () {
        state.filter = value;
        localStorage.setItem(FILTER_KEY, value);
        $all('.filter-btn').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-filter') === value);
        });
        applyFilter();
      });
    });
  }

  function initNameModal() {
    var form = $('#name-modal-form');
    var submitBtn = $('#name-modal-submit');
    var input = $('#name-modal-input');

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        completeNameModal();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        completeNameModal();
      });
    }

    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          completeNameModal();
        }
      });
    }

    var changeBtn = $('#change-reviewer');
    if (changeBtn) {
      changeBtn.addEventListener('click', function () {
        state.pendingAction = null;
        openNameModal();
      });
    }
  }

  function initRealtime() {
    var client = getSupabase();
    if (!client) return;

    client
      .channel('deck-copy-proposals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deck_review_decisions' },
        function () {
          loadData().then(renderAllCards);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deck_review_comments' },
        function () {
          loadData().then(renderAllCards);
        }
      )
      .subscribe();
  }

  function init() {
    state.reviewerId = getReviewerId();
    state.reviewerName = getReviewerName();

    initNameModal();

    var badge = $('#reviewer-badge');
    if (badge) {
      badge.textContent = state.reviewerName || 'Set your name';
      badge.classList.toggle('is-empty', !state.reviewerName);
    }

    $all('[data-item-id].card').forEach(function (card) {
      renderCardChrome(card);
    });

    initFilters();

    if (!state.reviewerName) {
      openNameModal();
    }

    loadData().then(function () {
      renderAllCards();
      initRealtime();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
