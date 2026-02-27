import React from 'react';
import Dragula from 'dragula';
import 'dragula/dist/dragula.css';
import Swimlane from './Swimlane';
import './Board.css';

export default class Board extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      clients: {
        backlog: [],
        inProgress: [],
        complete: [],
      }
    }
    this.swimlanes = {
      backlog: React.createRef(),
      inProgress: React.createRef(),
      complete: React.createRef(),
    }
  }

  async loadClientsFromApi() {
  const res = await fetch('/api/v1/clients');
  const all = await res.json();

  const backlog = all
    .filter(c => c.status === 'backlog')
    .sort((a,b) => a.priority - b.priority);

  const inProgress = all
    .filter(c => c.status === 'in-progress')
    .sort((a,b) => a.priority - b.priority);

  const complete = all
    .filter(c => c.status === 'complete')
    .sort((a,b) => a.priority - b.priority);

  this.setState({ clients: { backlog, inProgress, complete } });
  }

  componentDidMount() {
  this.loadClientsFromApi();

  // ensure refs are attached before initializing Dragula
  setTimeout(() => {
    const backlogEl = this.swimlanes.backlog.current;
    const inProgressEl = this.swimlanes.inProgress.current;
    const completeEl = this.swimlanes.complete.current;

    if (!backlogEl || !inProgressEl || !completeEl) {
      console.error('Swimlane refs are null. Check ref placement in Swimlane.js');
      return;
    }

    this.drake = Dragula([backlogEl, inProgressEl, completeEl], {
      moves(el, source, handle) {
        // safer: allow dragging anywhere inside the card
        if (!handle) return false;
        if (handle.closest) return !!handle.closest('.Card');
        // fallback (older browsers)
        return handle.classList && handle.classList.contains('Card');
      }
    });

    this.drake.on('drop', async () => {
      console.log('Dragula containers:', this.drake.containers);
      const nextClients = this.syncStateWithDOM();

      // keep React as source of truth
      this.drake.cancel(true);

      // update UI immediately
      this.setState({ clients: nextClients });

      // persist to backend
      try {
        await this.persistBoard(nextClients);
        await this.loadClientsFromApi();
      } catch (err) {
        console.error('Failed to save board state', err);
      }
    });
  }, 0);
}

  buildUpdates(nextClients) {
  const updates = [];

  // backlog: priority 1..n
  nextClients.backlog.forEach((c, idx) => {
    updates.push({ id: c.id, status: 'backlog', priority: idx + 1 });
  });
  // in-progress: priority 1..n
  nextClients.inProgress.forEach((c, idx) => {
    updates.push({ id: c.id, status: 'in-progress', priority: idx + 1 });
  });
  // complete: priority 1..n
  nextClients.complete.forEach((c, idx) => {
    updates.push({ id: c.id, status: 'complete', priority: idx + 1 });
  });

  return updates;
}

async persistBoard(nextClients) {
  const updates = this.buildUpdates(nextClients);

  // simplest approach: update ALL cards after every drop
  await Promise.all(
    updates.map((u) =>
      fetch(`/api/v1/clients/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: u.status, priority: u.priority }),
      })
    )
  );
}

  componentWillUnmount() {
    if (this.drake) this.drake.destroy();
  }

  syncStateWithDOM() {
    const allClients = [
      ...this.state.clients.backlog,
      ...this.state.clients.inProgress,
      ...this.state.clients.complete,
    ];

    const clientMap = {};
    allClients.forEach((c) => {
      clientMap[c.id] = c;
    });

    const getIdsFromLane = (laneRef) => {
      if (!laneRef.current) return [];
      return Array.from(laneRef.current.children).map((el) => el.dataset.id);
    };

    const backlogIds = getIdsFromLane(this.swimlanes.backlog);
    const inProgressIds = getIdsFromLane(this.swimlanes.inProgress);
    const completeIds = getIdsFromLane(this.swimlanes.complete);

    const backlog = backlogIds.map((id) => ({
      ...clientMap[id],
      status: 'backlog',
    }));

    const inProgress = inProgressIds.map((id) => ({
      ...clientMap[id],
      status: 'in-progress',
    }));

     const complete = completeIds.map((id) => ({
      ...clientMap[id],
      status: 'complete',
    }));

    return { backlog, inProgress, complete };
  }

  
  renderSwimlane(name, clients, ref) {
    return (
      <Swimlane name={name} clients={clients} dragulaRef={ref}/>
    );
  }

  render() {
    return (
      <div className="Board">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-4">
              {this.renderSwimlane('Backlog', this.state.clients.backlog, this.swimlanes.backlog)}
            </div>
            <div className="col-md-4">
              {this.renderSwimlane('In Progress', this.state.clients.inProgress, this.swimlanes.inProgress)}
            </div>
            <div className="col-md-4">
              {this.renderSwimlane('Complete', this.state.clients.complete, this.swimlanes.complete)}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
