const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const API = 'http://localhost:3000';

let current = new Date();
let selectedDate = null;      // "YYYY-MM-DD" string for the open modal
let events = [];              // flat array of event objects from the server

const daysGrid = document.getElementById('daysGrid');
const monthLabel = document.getElementById('monthLabel');
const yearLabel = document.getElementById('yearLabel');
const agendaTitle = document.getElementById('agendaTitle');
const agendaCount = document.getElementById('agendaCount');
const agendaList = document.getElementById('agendaList');
const overlay = document.getElementById('overlay');
const modalDate = document.getElementById('modalDate');
const modalEventList = document.getElementById('modalEventList');
const eventInput = document.getElementById('eventInput');

// build a real YYYY-MM-DD key (matches what the server validates)
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// pull every event for one day out of the flat array, sorted by start time
function eventsForDay(key) {
  return events
    .filter(e => e.date === key && !e.done)
    .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
}

async function loadEvents() {
  try {
    const res = await fetch(`${API}/events`);
    const data = await res.json();
    events = data.events || [];
  } catch {
    console.error('could not load events, is the server running?');
    events = [];
  }
  render();
}

async function saveEvent(evt) {
  const res = await fetch(`${API}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evt)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'save failed');
  events = data.events;
}

async function removeEvent(id) {
  const res = await fetch(`${API}/events`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  const data = await res.json();
  if (data.events) events = data.events;
}

async function setDone(id, done) {
  const res = await fetch(`${API}/events/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, done })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'could not update');
  events = data.events;
}

// format an event's time for display. "12:00–16:00", "12:00", or "" if no time
function timeLabel(ev) {
  if (!ev.start) return '';
  return ev.end ? `${ev.start}–${ev.end}` : ev.start;
}

// two timed events overlap if one starts before the other ends
function overlaps(a, b) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return a.start < b.end && b.start < a.end;
}

// find a fixed event on this day the new one collides with (or null)
function findFixedClash(newEvt) {
  return events.find(e =>
    e.fixed &&
    e.date === newEvt.date &&
    overlaps(e, newEvt)
  ) || null;
}

function render() {
  const year = current.getFullYear();
  const month = current.getMonth();
  monthLabel.textContent = MONTHS[month];
  yearLabel.textContent = year;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  daysGrid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'day blank';
    daysGrid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'day';

    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    if (isToday) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d;
    cell.appendChild(num);

    const key = dateKey(year, month, d);
    const dayEvents = eventsForDay(key);
    if (dayEvents.length) {
      const wrap = document.createElement('div');
      wrap.className = 'events';
      dayEvents.slice(0, 2).forEach(ev => {
        const e = document.createElement('div');
        e.className = `event pri-${ev.priority || 2}${ev.fixed ? ' is-fixed' : ''}`;
        const t = timeLabel(ev);
        const label = t ? `${t} ${ev.title}` : ev.title;

        e.textContent = label;
        e.title = label;   // full text on hover
        wrap.appendChild(e);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement('div');
        more.className = 'more';
        more.textContent = `+${dayEvents.length - 2} more`;
        wrap.appendChild(more);
      }
      cell.appendChild(wrap);
    }

    cell.addEventListener('click', () => openModal(year, month, d));
    daysGrid.appendChild(cell);
  }

  renderAgenda();
}

// list every event in the viewed month, sorted by date then time //
function renderAgenda() {
  const year = current.getFullYear();
  const month = current.getMonth();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

  const monthEvents = events
    .filter(e => e.date.startsWith(prefix) && !e.done)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start || '99:99').localeCompare(b.start || '99:99');
    });

  agendaTitle.textContent = `${MONTHS[month]} ${year}`;
  agendaCount.textContent = monthEvents.length
    ? `${monthEvents.length} event${monthEvents.length > 1 ? 's' : ''}`
    : '';

  agendaList.innerHTML = '';

  if (!monthEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'agenda-empty';
    empty.textContent = 'Nothing scheduled this month.';
    agendaList.appendChild(empty);
    return;
  }

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  monthEvents.forEach(ev => {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dow = dayNames[new Date(y, m - 1, d).getDay()];

    const row = document.createElement('div');
    row.className = 'agenda-row';

    const date = document.createElement('div');
    date.className = 'agenda-date';
    date.innerHTML = `<div class="dnum">${d}</div><div class="dday">${dow}</div>`;

    const bar = document.createElement('div');
    bar.className = `agenda-bar pri-${ev.priority || 2}`;

    const main = document.createElement('div');
    main.className = 'agenda-main';
    const t = timeLabel(ev);
    main.innerHTML = `<div class="atitle"></div>${t ? `<div class="atime">${t}</div>` : ''}`;
    main.querySelector('.atitle').textContent = ev.title;

    const tag = document.createElement('div');
    tag.className = `agenda-tag ${ev.fixed ? 'fixed' : ''}`;
    tag.textContent = ev.fixed ? 'Fixed' : 'Flexible';

    const tickBtn = document.createElement('button');
    tickBtn.type = 'button';
    tickBtn.className = 'agenda-done-button';
    tickBtn.textContent = '✓';
    tickBtn.title = 'Done';

    tickBtn.addEventListener('click', async event => {
      event.stopPropagation();

      try {
        await setDone(ev.id, true);
        render();
      } catch (err) {
        console.error('Could not mark event as done:', err);
      }
    });

    row.appendChild(date);
    row.appendChild(bar);
    row.appendChild(main);
    row.appendChild(tag);
    row.appendChild(tickBtn);
    agendaList.appendChild(row);
  });
}

function openModal(year, month, d) {
  selectedDate = dateKey(year, month, d);
  modalDate.textContent = `${MONTHS[month]} ${d}, ${year}`;
  renderModalEvents();
  overlay.classList.add('open');
  resetForm();
  eventInput.focus();
}

function renderModalEvents() {
  const list = eventsForDay(selectedDate);
  modalEventList.innerHTML = '';
  list.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'event-row';
    const span = document.createElement('span');
    const t = timeLabel(ev);
    span.textContent = t ? `${t} · ${ev.title}` : ev.title;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      await removeEvent(ev.id);
      renderModalEvents();
      render();
    });
    row.appendChild(span);
    row.appendChild(del);
    modalEventList.appendChild(row);
  });
}

const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const fixedToggle = document.getElementById('fixedToggle');
const priorityPicker = document.getElementById('priorityPicker');
const formError = document.getElementById('formError');

// fill both dropdowns with 15-min slots from 00:00 to 23:45, plus a blank "none"
function fillTimeOptions() {
  const opts = ['<option value="">--</option>'];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      opts.push(`<option value="${t}">${t}</option>`);
    }
  }
  startInput.innerHTML = opts.join('');
  endInput.innerHTML = opts.join('');
}
fillTimeOptions();

// clicking a toggle/priority button activates it and stores the value
function wireButtonGroup(container, optClass, attr) {
  container.querySelectorAll('.' + optClass).forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.' + optClass).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.dataset[attr] = btn.dataset.val;
    });
  });
}
wireButtonGroup(fixedToggle, 'toggle-opt', 'fixed');
wireButtonGroup(priorityPicker, 'pri-opt', 'priority');

// put the form back to defaults
function resetForm() {
  eventInput.value = '';
  startInput.value = '';
  endInput.value = '';
  fixedToggle.dataset.fixed = 'false';
  fixedToggle.querySelectorAll('.toggle-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.val === 'false'));
  priorityPicker.dataset.priority = '2';
  priorityPicker.querySelectorAll('.pri-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.val === '2'));
  formError.textContent = '';
}

async function addEvent() {
  const val = eventInput.value.trim();
  formError.textContent = '';

  if (!val) {
    formError.textContent = 'Give it a title.';
    return;
  }

  const start = startInput.value;
  const end = endInput.value;

  // if both times are set, end has to be after start
  if (start && end && end <= start) {
    formError.textContent = 'End time must be after start time.';
    return;
  }
  // an end with no start is ambiguous, block it
  if (end && !start) {
    formError.textContent = 'Pick a start time too.';
    return;
  }

  const candidate = {
    date: selectedDate,
    title: val,
    start,
    end,
    fixed: fixedToggle.dataset.fixed === 'true',
    priority: Number(priorityPicker.dataset.priority)
  };

  // client-side clash check for instant feedback (server double-checks too)
  const clash = findFixedClash(candidate);
  if (clash) {
    formError.textContent = `Clashes with "${clash.title}" (${clash.start}–${clash.end}).`;
    return;
  }

  try {
    await saveEvent(candidate);
    resetForm();
    renderModalEvents();
    render();
    eventInput.focus();
  } catch (err) {
    formError.textContent = err.message || "Couldn't save. Is the server running?";
  }
}

document.getElementById('prevBtn').addEventListener('click', () => { current.setMonth(current.getMonth() - 1); render(); });
document.getElementById('nextBtn').addEventListener('click', () => { current.setMonth(current.getMonth() + 1); render(); });
document.getElementById('todayBtn').addEventListener('click', () => { current = new Date(); render(); });
document.getElementById('addBtn').addEventListener('click', addEvent);
document.getElementById('closeBtn').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
eventInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addEvent(); });

loadEvents();  // fetch from server, then render

const chat = document.getElementById('chat');
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const messages = []; // {role: 'me'|'bot', text}

function addMessage(role, text) {
  messages.push({ role, text });
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
  return el;
}

async function sendMessage() {
  const val = chatInput.value.trim();
  if (!val) return;
  addMessage('me', val);
  chatInput.value = '';

  const thinking = addMessage('bot', 'thinking…');

  try {
    const res = await fetch(`${API}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: val, history: messages.slice(0, -1) })
    });
    const data = await res.json();
    thinking.remove();

    const p = data.proposal || { action: 'none', message: "hmm, got nothing back." };
    addMessage('bot', p.message);

    // 'ask' just shows the question and waits for the next user reply.
    // 'add'/'delete'/'move' show confirm buttons.
    if (p.action === 'add' || p.action === 'delete' || p.action === 'move') {
      showConfirm(p);
    }
  } catch (err) {
    thinking.remove();
    addMessage('bot', "can't reach the server. is the proxy running on :3000?");
  }
}

// render slot options for a move; picking one does delete-old + add-new
function showMoveOptions(proposal) {
  const box = document.createElement('div');
  box.className = 'move-options';

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  proposal.slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'move-opt';

    const [y, m, d] = slot.date.split('-').map(Number);
    const dow = dayNames[new Date(y, m - 1, d).getDay()];
    let label = `${dow} ${d}/${m} · ${slot.start}–${slot.end}`;
    if (slot.clashesWith) label += ` ⚠️ overlaps ${slot.clashesWith}`;
    btn.textContent = label;

    btn.addEventListener('click', async () => {
      box.remove();
      try {
        // recreate first, then remove the old, so a failure doesn't lose the event
        await saveEvent({
          date: slot.date,
          title: proposal.title,
          start: slot.start,
          end: slot.end,
          fixed: false,           // moved events stay flexible
          priority: proposal.priority
        });
        await removeEvent(proposal.id);
        render();
        addMessage('bot', `Moved "${proposal.title}" to ${label.replace(/ ⚠️.*/, '')}.`);
      } catch (err) {
        addMessage('bot', err.message || "Couldn't move it.");
      }
    });

    box.appendChild(btn);
  });

  const cancel = document.createElement('button');
  cancel.className = 'move-opt cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    box.remove();
    addMessage('bot', 'Okay, left it where it is.');
  });
  box.appendChild(cancel);

  chatBody.appendChild(box);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// render a little yes/no under the last bot message
function showConfirm(proposal) {
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';

  const yes = document.createElement('button');
  yes.className = 'confirm-yes';
  yes.textContent = 'Yes';

  const no = document.createElement('button');
  no.className = 'confirm-no';
  no.textContent = 'No';

  yes.addEventListener('click', async () => {
    bar.remove();
    try {
      if (proposal.action === 'add') {
        await saveEvent(proposal.event);   // same guarded endpoint as manual add
      } else if (proposal.action === 'delete') {
        await removeEvent(proposal.id);
      } else if (proposal.action === 'move') {
        // save the new one first, then remove the old, so a failure never loses it
        await saveEvent(proposal.event);
        await removeEvent(proposal.id);
      }
      render();
      addMessage('bot', 'Done.');
    } catch (err) {
      addMessage('bot', err.message || "Couldn't do that.");
    }
  });

  no.addEventListener('click', () => {
    bar.remove();
    addMessage('bot', 'Okay, left it alone.');
  });

  bar.appendChild(yes);
  bar.appendChild(no);
  chatBody.appendChild(bar);
  chatBody.scrollTop = chatBody.scrollHeight;
}

document.getElementById('chatSend').addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('chatToggle').addEventListener('click', () => {
  chat.classList.toggle('collapsed');
  document.getElementById('chatToggle').textContent = chat.classList.contains('collapsed') ? '+' : '–';
});

const agenda = document.getElementById('agenda');
document.getElementById('agendaToggle').addEventListener('click', () => {
  agenda.classList.toggle('collapsed');
  document.getElementById('agendaToggle').textContent = agenda.classList.contains('collapsed') ? '+' : '–';
});

/* =========================================================
   DAY, WEEK, MONTH AND YEAR CALENDAR VIEWS
   Added after the existing script.
========================================================= */

let currentView = 'month';

const calendarElement = document.querySelector('.calendar');
const weekdaysElement = document.querySelector('.weekdays');
const originalMonthRender = render;

function showMonthView() {
  calendarElement.classList.remove('year-calendar');
  weekdaysElement.style.display = 'grid';

  daysGrid.className = 'days month-view';

  originalMonthRender();
}

function showDayView() {
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();
  const key = dateKey(year, month, day);

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  calendarElement.classList.remove('year-calendar');
  weekdaysElement.style.display = 'none';

  monthLabel.textContent = dayNames[current.getDay()];
  yearLabel.textContent = `${MONTHS[month]} ${day}, ${year}`;

  daysGrid.className = 'days day-view';
  daysGrid.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'day-view-card';

  const title = document.createElement('div');
  title.className = 'day-view-title';
  title.textContent =
    `${dayNames[current.getDay()]}, ${MONTHS[month]} ${day}, ${year}`;

  card.appendChild(title);

  const eventContainer = document.createElement('div');
  eventContainer.className = 'day-view-events';

  const dayEvents = eventsForDay(key);

  if (!dayEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'day-view-empty';
    empty.textContent =
      'Nothing scheduled for this day. Click here to add an event.';

    eventContainer.appendChild(empty);
  } else {
    dayEvents.forEach(ev => {
      const eventElement = document.createElement('div');

      eventElement.className =
        `event day-view-event pri-${ev.priority || 2}` +
        `${ev.fixed ? ' is-fixed' : ''}`;

      const time = timeLabel(ev);

      eventElement.textContent = time
        ? `${time} · ${ev.title}`
        : ev.title;

      eventElement.title = eventElement.textContent;

      eventContainer.appendChild(eventElement);
    });
  }

  card.appendChild(eventContainer);

  card.addEventListener('click', () => {
    openModal(year, month, day);
  });

  daysGrid.appendChild(card);

  renderAgenda();
}

function getStartOfWeek(date) {
  const start = new Date(date);

  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  return start;
}

function createWeekDayCell(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const today = new Date();

  const cell = document.createElement('div');
  cell.className = 'day';

  const isToday =
    year === today.getFullYear() &&
    month === today.getMonth() &&
    day === today.getDate();

  if (isToday) {
    cell.classList.add('today');
  }

  const number = document.createElement('div');
  number.className = 'day-num';
  number.textContent = day;

  cell.appendChild(number);

  const key = dateKey(year, month, day);
  const dayEvents = eventsForDay(key);

  if (dayEvents.length) {
    const eventContainer = document.createElement('div');
    eventContainer.className = 'events';

    dayEvents.slice(0, 6).forEach(ev => {
      const eventElement = document.createElement('div');

      eventElement.className =
        `event pri-${ev.priority || 2}` +
        `${ev.fixed ? ' is-fixed' : ''}`;

      const time = timeLabel(ev);

      eventElement.textContent = time
        ? `${time} ${ev.title}`
        : ev.title;

      eventElement.title = eventElement.textContent;

      eventContainer.appendChild(eventElement);
    });

    if (dayEvents.length > 6) {
      const more = document.createElement('div');
      more.className = 'more';
      more.textContent = `+${dayEvents.length - 6} more`;

      eventContainer.appendChild(more);
    }

    cell.appendChild(eventContainer);
  }

  cell.addEventListener('click', () => {
    openModal(year, month, day);
  });

  return cell;
}

function showWeekView() {
  const weekStart = getStartOfWeek(current);
  const weekEnd = new Date(weekStart);

  weekEnd.setDate(weekEnd.getDate() + 6);

  calendarElement.classList.remove('year-calendar');
  weekdaysElement.style.display = 'grid';

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    monthLabel.textContent = MONTHS[weekStart.getMonth()];
  } else {
    monthLabel.textContent =
      `${MONTHS[weekStart.getMonth()]} – ` +
      `${MONTHS[weekEnd.getMonth()]}`;
  }

  if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    yearLabel.textContent = weekStart.getFullYear();
  } else {
    yearLabel.textContent =
      `${weekStart.getFullYear()} – ${weekEnd.getFullYear()}`;
  }

  daysGrid.className = 'days week-view';
  daysGrid.innerHTML = '';

  for (let index = 0; index < 7; index++) {
    const date = new Date(weekStart);

    date.setDate(weekStart.getDate() + index);

    daysGrid.appendChild(createWeekDayCell(date));
  }

  renderAgenda();
}

function showYearView() {
  const year = current.getFullYear();
  const today = new Date();

  const shortDayNames = [
    'S',
    'M',
    'T',
    'W',
    'T',
    'F',
    'S'
  ];

  calendarElement.classList.add('year-calendar');
  weekdaysElement.style.display = 'none';

  monthLabel.textContent = year;
  yearLabel.textContent = 'Year view';

  daysGrid.className = 'days year-view';
  daysGrid.innerHTML = '';

  for (let month = 0; month < 12; month++) {
    const monthContainer = document.createElement('div');
    monthContainer.className = 'year-month';

    const monthTitle = document.createElement('div');
    monthTitle.className = 'year-month-title';
    monthTitle.textContent = MONTHS[month];

    monthContainer.appendChild(monthTitle);

    const weekdayRow = document.createElement('div');
    weekdayRow.className = 'year-weekdays';

    shortDayNames.forEach(name => {
      const weekday = document.createElement('div');
      weekday.textContent = name;

      weekdayRow.appendChild(weekday);
    });

    monthContainer.appendChild(weekdayRow);

    const monthGrid = document.createElement('div');
    monthGrid.className = 'year-days';

    const firstDay = new Date(year, month, 1).getDay();
    const numberOfDays = new Date(year, month + 1, 0).getDate();

    for (
      let blankIndex = 0;
      blankIndex < firstDay;
      blankIndex++
    ) {
      const blank = document.createElement('div');
      blank.className = 'year-day blank';

      monthGrid.appendChild(blank);
    }

    for (let day = 1; day <= numberOfDays; day++) {
      const dayElement = document.createElement('div');
      dayElement.className = 'year-day';
      dayElement.textContent = day;

      const isToday =
        year === today.getFullYear() &&
        month === today.getMonth() &&
        day === today.getDate();

      if (isToday) {
        dayElement.classList.add('today');
      }

      const key = dateKey(year, month, day);
      const dayEvents = eventsForDay(key);

      if (dayEvents.length) {
        const dot = document.createElement('span');
        dot.className = 'year-event-dot';

        dayElement.appendChild(dot);
      }

      dayElement.addEventListener('click', () => {
        openModal(year, month, day);
      });

      monthGrid.appendChild(dayElement);
    }

    monthContainer.appendChild(monthGrid);
    daysGrid.appendChild(monthContainer);
  }

  renderAgenda();
}

function renderCurrentView() {
  if (currentView === 'day') {
    showDayView();
  } else if (currentView === 'week') {
    showWeekView();
  } else if (currentView === 'year') {
    showYearView();
  } else {
    showMonthView();
  }
}

/*
 * Existing functions such as addEvent(), removeEvent() and loadEvents()
 * call render(). Redirect those calls to the currently selected view.
 */
render = renderCurrentView;

const viewButtons = document.querySelectorAll('.view-btn');

viewButtons.forEach(button => {
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    const selectedView = button.dataset.view;

    if (!['day', 'week', 'month', 'year'].includes(selectedView)) {
      console.error('Invalid calendar view:', selectedView);
      return;
    }

    currentView = selectedView;

    viewButtons.forEach(viewButton => {
      viewButton.classList.toggle(
        'active',
        viewButton === button
      );
    });

    renderCurrentView();
  });
});

/*
 * These listeners run before the original month navigation listeners.
 * For Month view, the original listeners are allowed to run.
 * For other views, they are stopped and handled here.
 */
document.getElementById('prevBtn').addEventListener(
  'click',
  event => {
    if (currentView === 'month') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (currentView === 'day') {
      current.setDate(current.getDate() - 1);
    } else if (currentView === 'week') {
      current.setDate(current.getDate() - 7);
    } else if (currentView === 'year') {
      current.setFullYear(current.getFullYear() - 1);
    }

    renderCurrentView();
  },
  true
);

document.getElementById('nextBtn').addEventListener(
  'click',
  event => {
    if (currentView === 'month') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (currentView === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (currentView === 'week') {
      current.setDate(current.getDate() + 7);
    } else if (currentView === 'year') {
      current.setFullYear(current.getFullYear() + 1);
    }

    renderCurrentView();
  },
  true
);