/**
 * MVVM — Repositories.
 *
 * The repository layer is the only place that talks to the backend.
 * ViewModels depend on this abstract surface (not on `fetch` directly),
 * which makes them testable, swappable, and lets us add caching/mocking
 * in one place.
 */
export * from './authRepository';
export * from './dashboardRepository';
export * from './alertsRepository';
export * from './camerasRepository';
