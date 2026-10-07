
const MENU = [
  {
    id: "ramen",
    name: "Ramen Tonkotsu",
    description: "Caldo, fideos, huevo marinado, chashu y montaje final.",
    tasks: [
      { id: "r1", name: "Preparar caldo tonkotsu", duration: 1400, station: "Fogón" },
      { id: "r2", name: "Cocinar fideos", duration: 700, station: "Fogón" },
      { id: "r3", name: "Marinar huevo ajitsuke", duration: 900 },
      { id: "r4", name: "Laminar chashu", duration: 500 },
      { id: "r5", name: "Montar el tazón", duration: 400 },
    ],
  },
  {
    id: "sushi",
    name: "Sushi Nigiri",
    description: "Arroz sazonado, corte de pescado, nori y emplatado.",
    tasks: [
      { id: "s1", name: "Cocer y sazonar el arroz", duration: 1200, station: "Mesa de trabajo" },
      { id: "s2", name: "Cortar el pescado", duration: 800, station: "Mesa de trabajo" },
      { id: "s3", name: "Tostar nori", duration: 350 },
      { id: "s4", name: "Formar nigiri", duration: 900 },
      { id: "s5", name: "Emplatar con wasabi", duration: 400 },
    ],
  },
  {
    id: "jiaozi",
    name: "Jiaozi (dumplings)",
    description: "Relleno, masa, plegado, cocción al vapor y salsa.",
    tasks: [
      { id: "j1", name: "Picar el relleno", duration: 800, station: "Mesa de trabajo" },
      { id: "j2", name: "Amasar la masa", duration: 1000, station: "Mesa de trabajo" },
      { id: "j3", name: "Plegar dumplings", duration: 1100 },
      { id: "j4", name: "Cocer al vapor", duration: 900 },
      { id: "j5", name: "Preparar salsa de soja", duration: 350 },
    ],
  },
];


const TIME_QUANTUM_MS = 120;


const CONTEXT_SWITCH_COST_MS = 35;



function cloneTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    remaining: task.duration,
    progress: 0,
    status: "pending",
  }));
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(2)} s`;
}

function statusLabel(status) {
  if (status === "preparing") return "Preparando";
  if (status === "completed") return "Completada";
  if (status === "waiting") return "Esperando";
  return "Pendiente";
}

function createTaskCard(task, showStation = false) {
  const li = document.createElement("li");
  li.className = "task-card is-idle";
  li.dataset.taskId = task.id;
  li.innerHTML = `
    <div class="task-top">
      <span class="task-name">${task.name}${showStation && task.station ? ` <small class="station-tag">🔒 ${task.station}</small>` : ""}</span>
      <span class="task-meta" data-meta>${formatSeconds(0)} / ${formatSeconds(task.duration)}</span>
    </div>
    <progress data-bar value="0" max="${task.duration}"></progress>
    <span class="status-pill" data-pill>Pendiente</span>
  `;
  return li;
}

function paintTask(card, task, isActive) {
  const done = task.status === "completed";
  const preparing = task.status === "preparing";
  const waiting = task.status === "waiting";
  card.classList.toggle("is-preparing", preparing && isActive);
  card.classList.toggle("is-completed", done);
  card.classList.toggle("is-waiting", waiting);
  card.classList.toggle("is-idle", !preparing && !done && !waiting);

  const elapsed = task.duration - task.remaining;
  card.querySelector("[data-bar]").value = elapsed;
  card.querySelector("[data-meta]").textContent = `${formatSeconds(elapsed)} / ${formatSeconds(task.duration)}`;

  const pill = card.querySelector("[data-pill]");
  pill.textContent = waiting ? `Esperando: ${task.station}` : statusLabel(task.status);
  pill.className = `status-pill ${task.status === "pending" ? "" : task.status}`.trim();
}




class Mutex {
  constructor(name) {
    this.name = name;
    this.owner = null;
    this.queue = [];
  }

  lock(id) {
    if (this.owner === id) return true;
    if (this.owner === null && (this.queue.length === 0 || this.queue[0] === id)) {
      this.owner = id;
      this.queue = this.queue.filter((q) => q !== id);
      return true;
    }
    if (!this.queue.includes(id)) this.queue.push(id);
    return false;
  }

  unlock(id) {
    if (this.owner === id) this.owner = null;
  }
}


class Barrier {
  constructor(parties) {
    this.parties = parties;
    this.arrived = new Set();
    this.open = false;
  }

  get count() {
    return this.arrived.size;
  }

  arrive(id) {
    this.arrived.add(id);
    if (this.arrived.size >= this.parties) this.open = true;
    return this.open;
  }
}

class SequentialKitchen {
  constructor(tasks, roots) {
    this.tasks = cloneTasks(tasks);
    this.roots = roots;
    this.index = 0;
    this.elapsed = 0;
    this.done = false;
    this.activeName = "Ninguna tarea en ejecución";
    this.chefStatus = "En espera";
    this.renderInitial();
  }

  renderInitial() {
    this.roots.list.innerHTML = "";
    this.cards = new Map();
    this.tasks.forEach((task) => {
      const card = createTaskCard(task);
      this.cards.set(task.id, card);
      this.roots.list.appendChild(card);
    });
    this.paint();
  }

   
  tick(dt) {
    if (this.done) return;

    this.elapsed += dt;
    const task = this.tasks[this.index];
    if (!task) {
      this.finish();
      return;
    }

    task.status = "preparing";
    task.remaining = Math.max(0, task.remaining - dt);
    this.activeName = `Ejecutando: ${task.name}`;
    this.chefStatus = "Cocinando (secuencial)";

    if (task.remaining === 0) {
      task.status = "completed";
      this.index += 1;
      if (this.index >= this.tasks.length) this.finish();
    }

    this.paint();
  }

  finish() {
    this.done = true;
    this.activeName = "Servicio completado";
    this.chefStatus = "Finalizado";
    this.paint();
  }

  paint() {
    if (this.done) this.roots.clock.textContent = formatSeconds(this.elapsed);
    this.roots.active.textContent = this.activeName;
    this.roots.chefStatus.textContent = this.chefStatus;
    this.roots.chefStatus.className = `chef-status ${this.done ? "is-done" : "is-busy"}`;
    const current = this.tasks[this.index];
    this.tasks.forEach((task) => {
      paintTask(this.cards.get(task.id), task, current && task.id === current.id);
    });
  }
}


class ConcurrentKitchen {
  constructor(tasks, roots) {
    this.tasks = cloneTasks(tasks);
    this.roots = roots;
    this.cursor = 0;
    this.sliceUsed = 0;
    this.switchPenalty = 0;
    this.switchCount = 0;
    this.elapsed = 0;
    this.done = false;
    this.switching = false;
    this.activeName = "Ninguna tarea en ejecución";
    this.chefStatus = "En espera";
    this.renderInitial();
  }

  renderInitial() {
    this.roots.list.innerHTML = "";
    this.cards = new Map();
    this.tasks.forEach((task) => {
      const card = createTaskCard(task);
      this.cards.set(task.id, card);
      this.roots.list.appendChild(card);
    });
    this.paint();
  }

  unfinishedIndexes() {
    const pending = this.tasks
      .map((task, i) => (task.status !== "completed" ? i : -1))
      .filter((i) => i >= 0);

    
    const lastIndex = this.tasks.length - 1;
    if (pending.length > 1 && pending.includes(lastIndex)) {
      return pending.filter((i) => i !== lastIndex);
    }
    return pending;
  }

  
   
  tick(dt) {
    if (this.done) return;
    this.elapsed += dt;

    const pending = this.unfinishedIndexes();
    if (pending.length === 0) {
      this.finish();
      return;
    }

    if (this.switching) {
      this.switchPenalty = Math.max(0, this.switchPenalty - dt);
      this.activeName = "Cambio de contexto: el chef cambia de estación";
      this.chefStatus = "Cambiando de contexto";
      this.tasks.forEach((task) => {
        if (task.status === "preparing") task.status = "pending";
      });
      if (this.switchPenalty === 0) this.switching = false;
      this.paint();
      return;
    }

    if (!pending.includes(this.cursor)) {
      this.cursor = pending[0];
    }

    const task = this.tasks[this.cursor];
    this.tasks.forEach((item) => {
      if (item.status !== "completed" && item !== task) item.status = "pending";
    });
    task.status = "preparing";
    const work = Math.min(dt, task.remaining, TIME_QUANTUM_MS - this.sliceUsed);
    task.remaining -= work;
    this.sliceUsed += work;
    this.activeName = `Chef atendiendo: ${task.name}`;
    this.chefStatus = "Cocinando (una tarea a la vez)";

    const leftover = dt - work;

    if (task.remaining <= 0) {
      task.status = "completed";
      task.remaining = 0;
      this.sliceUsed = 0;
      this.jumpToNext(true);
    } else if (this.sliceUsed >= TIME_QUANTUM_MS) {
      task.status = "pending";
      this.sliceUsed = 0;
      this.jumpToNext(true);
    }

  
    void leftover;
    this.paint();
  }

  jumpToNext(paySwitchCost) {
    const pending = this.unfinishedIndexes();
    if (pending.length === 0) {
      this.finish();
      return;
    }

    const pos = pending.findIndex((i) => i > this.cursor);
    const next = pos === -1 ? pending[0] : pending[pos];

    if (paySwitchCost && next !== this.cursor && pending.length > 0) {
      this.switching = true;
      this.switchPenalty = CONTEXT_SWITCH_COST_MS;
      this.switchCount += 1;
      this.showSwitchBanner();
    }
    this.cursor = next;
  }

  showSwitchBanner() {
    const banner = this.roots.banner;
    banner.hidden = false;
    banner.classList.remove("is-visible");
    void banner.offsetWidth;
    banner.classList.add("is-visible");
    banner.textContent = `Cambio de contexto #${this.switchCount}`;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      banner.classList.remove("is-visible");
      banner.hidden = true;
    }, 520);
  }

  finish() {
    this.done = true;
    this.switching = false;
    this.activeName = "Servicio completado";
    this.chefStatus = "Finalizado";
    this.paint();
  }

  paint() {
    if (this.done) this.roots.clock.textContent = formatSeconds(this.elapsed);
    this.roots.active.textContent = this.activeName;
    this.roots.chefStatus.textContent = this.chefStatus;
    this.roots.chefStatus.className = `chef-status ${this.done ? "is-done" : "is-busy"}`;
    this.roots.switchCount.textContent = String(this.switchCount);
    const current = this.tasks[this.cursor];
    this.tasks.forEach((task) => {
      const active = !this.switching && current && task.id === current.id && task.status === "preparing";
      paintTask(this.cards.get(task.id), task, active);
    });
  }
}


class ParallelKitchen {
  constructor(tasks, chefCount, board, clock, syncBox) {
    this.elapsed = 0;
    this.done = false;
    this.chefCount = chefCount;
    this.clock = clock;
    this.board = board;
    this.syncBox = syncBox;
    this.log = [];
    this.chefs = this.assign(cloneTasks(tasks), chefCount);

    
    this.mutexes = new Map();
    this.allTasks().forEach((task) => {
      if (task.station && !this.mutexes.has(task.station)) {
        this.mutexes.set(task.station, new Mutex(task.station));
      }
    });

    
    this.barrier = new Barrier(this.chefs.filter((chef) => chef.tasks.length > 0).length);
    this.renderInitial();
  }

  assign(tasks, chefCount) {
    const chefs = Array.from({ length: chefCount }, (_, i) => ({
      id: i + 1,
      name: `Chef ${i + 1}`,
      tasks: [],
      index: 0,
      done: false,
      arrived: false,
      holding: false,
      cards: new Map(),
      finalTaskId: null,
    }));

    const regular = tasks.slice(0, -1);
    const finalTask = tasks[tasks.length - 1];

    regular.forEach((task, i) => {
      chefs[i % chefCount].tasks.push(task);
    });
    chefs[0].tasks.push(finalTask);
    chefs[0].finalTaskId = finalTask.id;

    chefs.forEach((chef) => {
      if (chef.tasks.length === 0) chef.done = true;
    });
    return chefs;
  }

  renderInitial() {
    this.board.innerHTML = "";
    this.chefs.forEach((chef) => {
      const lane = document.createElement("section");
      lane.className = "chef-lane";
      const empty = chef.tasks.length === 0
        ? "<p class='results-hint'>Sin tareas asignadas.</p>"
        : "";
      lane.innerHTML = `
        <h3>
          <span>${chef.name}</span>
          <span data-chef-live="${chef.id}">En espera</span>
        </h3>
        <ul class="task-list" data-chef-list="${chef.id}"></ul>
        ${empty}
      `;
      const list = lane.querySelector("[data-chef-list]");
      chef.tasks.forEach((task) => {
        const card = createTaskCard(task, true);
        chef.cards.set(task.id, card);
        list.appendChild(card);
      });
      this.board.appendChild(lane);
    });
    this.paint();
  }

  record(message) {
    this.log.push(`${formatSeconds(this.elapsed)} · ${message}`);
  }

  tick(dt) {
    if (this.done) return;
    this.elapsed += dt;

    this.chefs.forEach((chef) => {
      if (chef.done) return;
      const task = chef.tasks[chef.index];
      const isFinal = task && chef.finalTaskId === task.id;

    
      if (!task || isFinal) {
        if (!chef.arrived) {
          chef.arrived = true;
          const opened = this.barrier.arrive(chef.id);
          this.record(`${chef.name} llega a la barrera (${this.barrier.count}/${this.barrier.parties})`);
          if (opened) this.record("Barrera abierta: todos terminaron sus tareas");
        }
        if (!this.barrier.open) return; 
        if (!task) {
          chef.done = true;
          return;
        }
      }

    
      const mutex = task.station ? this.mutexes.get(task.station) : null;
      if (mutex) {
        if (!mutex.lock(chef.id)) {
          if (task.status !== "waiting") {
            this.record(`${chef.name} espera: «${task.station}» ocupado por Chef ${mutex.owner}`);
          }
          task.status = "waiting";
          return;
        }
        if (!chef.holding) {
          chef.holding = true;
          this.record(`${chef.name} adquiere el mutex de «${task.station}»`);
        }
      }

      task.status = "preparing";
      task.remaining = Math.max(0, task.remaining - dt);
      if (task.remaining === 0) {
        task.status = "completed";
        if (mutex) {
          mutex.unlock(chef.id);
          chef.holding = false;
          this.record(`${chef.name} libera el mutex de «${task.station}»`);
        }
        chef.index += 1;
        if (chef.index >= chef.tasks.length && this.barrier.open) chef.done = true;
      }
    });

    if (this.chefs.every((chef) => chef.done)) this.done = true;
    this.paint();
  }

  paint() {
    if (this.done) this.clock.textContent = formatSeconds(this.elapsed);
    this.chefs.forEach((chef) => {
      const live = this.board.querySelector(`[data-chef-live="${chef.id}"]`);
      const current = chef.tasks[chef.index];
      if (chef.done) {
        live.textContent = chef.tasks.length ? "Finalizado" : "Inactivo";
      } else if (chef.arrived && !this.barrier.open) {
        live.textContent = `En la barrera (${this.barrier.count}/${this.barrier.parties})`;
      } else if (current && current.status === "waiting") {
        live.textContent = `Esperando: ${current.station}`;
      } else {
        live.textContent = current ? `Preparando: ${current.name}` : "En espera";
      }
      chef.tasks.forEach((task, i) => {
        paintTask(chef.cards.get(task.id), task, i === chef.index && task.status === "preparing");
      });
    });
    this.paintSync();
  }

  paintSync() {
    if (!this.syncBox) return;
    const mutexRows = [...this.mutexes.values()]
      .map((m) => {
        const state = m.owner === null ? "libre" : `ocupado por Chef ${m.owner}`;
        const queue = m.queue.length ? ` · en cola: ${m.queue.map((id) => `Chef ${id}`).join(", ")}` : "";
        return `<li>🔒 Mutex «${m.name}»: <strong>${state}</strong>${queue}</li>`;
      })
      .join("");
    const b = this.barrier;
    const barrierRow = `<li>🚧 Barrera: <strong>${b.open ? "abierta" : "cerrada"}</strong> · ${b.count}/${b.parties} chefs han llegado</li>`;
    const events = this.log.slice(-8).map((e) => `<li>${e}</li>`).join("");
    this.syncBox.innerHTML = `
      <h3>Sincronización</h3>
      <ul class="sync-state">${mutexRows}${barrierRow}</ul>
      <ul class="sync-log">${events}</ul>`;
  }

  allTasks() {
    return this.chefs.flatMap((chef) => chef.tasks);
  }
}


class SimulationController {
  constructor() {
    this.dishSelect = document.getElementById("dish-select");
    this.chefsSelect = document.getElementById("chefs-select");
    this.btnStart = document.getElementById("btn-start");
    this.btnReset = document.getElementById("btn-reset");
    this.preview = document.getElementById("dish-preview");
    this.resultsBody = document.getElementById("results-body");

    this.running = false;
    this.rafId = null;
    this.lastTs = 0;
    this.seq = null;
    this.con = null;
    this.par = null;

    this.populateMenu();
    this.bind();
    this.reset(false);
  }

  populateMenu() {
    this.dishSelect.innerHTML = MENU.map(
      (dish) => `<option value="${dish.id}">${dish.name}</option>`
    ).join("");
  }

  currentDish() {
    return MENU.find((dish) => dish.id === this.dishSelect.value) || MENU[0];
  }

  bind() {
    this.dishSelect.addEventListener("change", () => this.updatePreview());
    this.btnStart.addEventListener("click", () => this.start());
    this.btnReset.addEventListener("click", () => this.reset(true));
  }

  updatePreview() {
    const dish = this.currentDish();
    const total = dish.tasks.reduce((sum, task) => sum + task.duration, 0);
    this.preview.textContent = `${dish.name}: ${dish.description} · ${dish.tasks.length} tareas · carga secuencial ${formatSeconds(total)}.`;
  }

  
  mountKitchens() {
    const dish = this.currentDish();
    const chefCount = Number(this.chefsSelect.value);

    this.seq = new SequentialKitchen(dish.tasks, {
      list: document.querySelector('[data-tasks="sequential"]'),
      clock: document.querySelector('[data-clock="sequential"]'),
      active: document.querySelector('[data-active="sequential"]'),
      chefStatus: document.querySelector('[data-chef-status="sequential"]'),
    });

    this.con = new ConcurrentKitchen(dish.tasks, {
      list: document.querySelector('[data-tasks="concurrent"]'),
      clock: document.querySelector('[data-clock="concurrent"]'),
      active: document.querySelector('[data-active="concurrent"]'),
      chefStatus: document.querySelector('[data-chef-status="concurrent"]'),
      banner: document.getElementById("switch-banner"),
      switchCount: document.getElementById("switch-count"),
    });

    this.par = new ParallelKitchen(
      dish.tasks,
      chefCount,
      document.querySelector("[data-chefs-board]"),
      document.querySelector('[data-clock="parallel"]'),
      document.querySelector("[data-sync-box]")
    );
  }

  start() {
    if (this.running) return;
    this.mountKitchens();
    this.running = true;
    this.btnStart.disabled = true;
    this.dishSelect.disabled = true;
    this.chefsSelect.disabled = true;
    this.lastTs = 0;
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  }

  loop(ts) {
    if (!this.running) return;
    if (!this.lastTs) this.lastTs = ts;
   
    const dt = Math.min(48, ts - this.lastTs);
    this.lastTs = ts;

    this.seq.tick(dt);
    this.con.tick(dt);
    this.par.tick(dt);

    if (this.seq.done && this.con.done && this.par.done) {
      this.running = false;
      this.btnStart.disabled = false;
      this.dishSelect.disabled = false;
      this.chefsSelect.disabled = false;
      this.renderResults();
      return;
    }

    this.rafId = requestAnimationFrame((next) => this.loop(next));
  }

  improvement(baseMs, otherMs) {
    if (baseMs <= 0) return "—";
    const pct = ((baseMs - otherMs) / baseMs) * 100;
    if (Math.abs(pct) < 0.05) return "0.0 % (equivalente)";
    if (pct > 0) return `${pct.toFixed(1)} % más rápido`;
    return `${Math.abs(pct).toFixed(1)} % más lento`;
  }

  renderResults() {
    const dish = this.currentDish();
    const rows = [
      {
        model: "No Concurrente",
        time: this.seq.elapsed,
        chefs: 1,
        tasks: dish.tasks.length,
        note: "Referencia (100 %)",
      },
      {
        model: "Concurrente",
        time: this.con.elapsed,
        chefs: 1,
        tasks: dish.tasks.length,
        note: this.improvement(this.seq.elapsed, this.con.elapsed),
      },
      {
        model: "Paralelo",
        time: this.par.elapsed,
        chefs: this.par.chefCount,
        tasks: dish.tasks.length,
        note: this.improvement(this.seq.elapsed, this.par.elapsed),
      },
    ];

    const best = Math.min(...rows.map((row) => row.time));
    this.resultsBody.innerHTML = rows
      .map(
        (row) => `
        <tr class="${row.time === best ? "winner" : ""}">
          <td>${row.model}</td>
          <td>${formatSeconds(row.time)}</td>
          <td>${row.chefs}</td>
          <td>${row.tasks}</td>
          <td>${row.note}</td>
        </tr>`
      )
      .join("");
  }

  reset(fromUser) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.running = false;
    this.rafId = null;
    this.btnStart.disabled = false;
    this.dishSelect.disabled = false;
    this.chefsSelect.disabled = false;
    this.updatePreview();
    this.mountKitchens();
    document.getElementById("switch-count").textContent = "0";
    document.getElementById("switch-banner").hidden = true;
    document.getElementById("switch-banner").classList.remove("is-visible");
    if (fromUser) {
      this.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">Aún no hay resultados.</td></tr>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SimulationController();
});
 