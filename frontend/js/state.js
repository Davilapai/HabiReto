/**
 * Gestor de estado reactivo y registro de identidades de demostración para HabiReto.
 * 
 * Centraliza la identidad activa para garantizar que todos los módulos y llamadas HTTP
 * utilicen coherentemente el encabezado X-User-Id correspondiente.
 */

export const DEMO_USERS = {
  alice: {
    key: "alice",
    id: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-2222-4111-8111-111111111111",
    name: "Alice Titular",
    shortName: "Alice",
    role: "Titular",
    email: "alice@habireto.com",
    phone: "+573001111111",
    initials: "AT",
  },
  bob: {
    key: "bob",
    id: "22222222-1111-4222-8222-222222222222",
    accountId: "22222222-2222-4222-8222-222222222222",
    name: "Bob Roommate",
    shortName: "Bob",
    role: "Roommate",
    email: "bob@habireto.com",
    phone: "+573002222222",
    initials: "BR",
  },
  charlie: {
    key: "charlie",
    id: "33333333-1111-4333-8333-333333333333",
    accountId: "33333333-2222-4333-8333-333333333333",
    name: "Charlie Amigo",
    shortName: "Charlie",
    role: "Amigo",
    email: "charlie@habireto.com",
    phone: "+573003333333",
    initials: "CA",
  },
};

class StateStore {
  constructor() {
    this.state = {
      activeUser: DEMO_USERS.alice,
      balance: 0,
      currency: "COP",
      history: [],
      cows: [],
      activeTab: "dashboard", // 'dashboard' | 'cows'
      isLoading: false,
    };
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  getActiveUser() {
    return this.state.activeUser;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setActiveUser(userKey) {
    const user = DEMO_USERS[userKey];
    if (user && user.id !== this.state.activeUser.id) {
      // Limpia datos específicos de la identidad previa para evitar parpadeos
      this.setState({
        activeUser: user,
        balance: 0,
        history: [],
        isLoading: true,
      });
    }
  }

  setActiveTab(tabName) {
    if (this.state.activeTab !== tabName) {
      this.setState({ activeTab: tabName });
    }
  }
}

export const store = new StateStore();
