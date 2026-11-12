/**
 * Gestor de estado reactivo y registro de identidades de demostración para HabiReto.
 * 
 * Centraliza la identidad activa para garantizar que todos los módulos y llamadas HTTP
 * utilicen coherentemente el encabezado X-User-Id correspondiente.
 */

export function computeInitials(name) {
  if (!name) return "US";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function computeFallbackUserKey(userId, fullName) {
  const cleanId = String(userId || "").toLowerCase();
  if (
    cleanId === "11111111-1111-4111-8111-111111111111" ||
    cleanId === "11111111-1111-1111-1111-111111111111"
  ) {
    return "@ALI111";
  }
  if (
    cleanId === "22222222-1111-4222-8222-222222222222" ||
    cleanId === "22222222-2222-2222-2222-222222222222"
  ) {
    return "@BOB222";
  }
  if (
    cleanId === "33333333-1111-4333-8333-333333333333" ||
    cleanId === "33333333-3333-3333-3333-333333333333"
  ) {
    return "@CHA333";
  }

  const letters = String(fullName || "USR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  const hexTail = cleanId.replace(/[^0-9a-f]/g, "").slice(-6) || "000";
  const digits = String(parseInt(hexTail, 16) % 1000).padStart(3, "0");
  return `@${letters}${digits}`;
}

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
    userKey: "@ALI111",
    initials: "AT",
    accountNumber: "ACC-ALICE1",
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
    userKey: "@BOB222",
    initials: "BR",
    accountNumber: "ACC-BOB2",
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
    userKey: "@CHA333",
    initials: "CA",
    accountNumber: "ACC-CHARLIE3",
  },
};

class StateStore {
  constructor() {
    this.state = {
      activeUser: DEMO_USERS.alice,
      users: Object.values(DEMO_USERS),
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

  getUsers() {
    return this.state.users && this.state.users.length > 0
      ? this.state.users
      : Object.values(DEMO_USERS);
  }

  setUsers(userList) {
    if (!Array.isArray(userList)) return;
    const formatted = userList.map((u) => {
      const demo = Object.values(DEMO_USERS).find(
        (d) => d.id === u.id || d.email === u.email
      );
      return {
        key: demo ? demo.key : u.id,
        id: u.id,
        accountId: u.account_id || (demo ? demo.accountId : null),
        name: u.full_name,
        shortName: u.full_name ? u.full_name.split(" ")[0] : "Usuario",
        role: demo ? demo.role : "Usuario",
        email: u.email,
        phone: u.phone_number,
        userKey: u.user_key || (demo ? demo.userKey : computeFallbackUserKey(u.id, u.full_name)),
        initials: computeInitials(u.full_name),
        accountNumber: u.account_number || (demo ? demo.accountNumber : "Cuenta"),
        balance: u.balance !== undefined ? u.balance : null,
      };
    });

    // Mantener la identidad activa sincronizada con los nuevos datos
    const currentActiveId = this.state.activeUser.id;
    const updatedActive = formatted.find((u) => u.id === currentActiveId);

    this.setState({
      users: formatted,
      ...(updatedActive ? { activeUser: updatedActive } : {}),
    });
  }

  addUser(newUser) {
    const formatted = {
      key: newUser.id,
      id: newUser.id,
      accountId: newUser.account_id,
      name: newUser.full_name,
      shortName: newUser.full_name.split(" ")[0],
      role: "Usuario",
      email: newUser.email,
      phone: newUser.phone_number,
      userKey: newUser.user_key || computeFallbackUserKey(newUser.id, newUser.full_name),
      initials: computeInitials(newUser.full_name),
      accountNumber: newUser.account_number || "Cuenta Corriente",
      balance: newUser.balance !== undefined ? newUser.balance : 0,
    };

    const exists = this.state.users.some((u) => u.id === formatted.id);
    const updatedUsers = exists
      ? this.state.users.map((u) => (u.id === formatted.id ? formatted : u))
      : [...this.state.users, formatted];

    this.setState({
      users: updatedUsers,
      activeUser: formatted,
      balance: formatted.balance || 0,
      history: [],
      cows: [],
      isLoading: true,
    });
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

  setActiveUser(userKeyOrId) {
    const users = this.getUsers();
    const user =
      users.find((u) => u.key === userKeyOrId || u.id === userKeyOrId) ||
      DEMO_USERS[userKeyOrId];

    if (user && user.id !== this.state.activeUser.id) {
      this.setState({
        activeUser: user,
        balance: user.balance !== null && user.balance !== undefined ? user.balance : 0,
        history: [],
        cows: [],
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
