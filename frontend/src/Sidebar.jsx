import React from 'react';
import AuthPanel from './AuthPanel';

const Sidebar = ({ activeFilter, onFilterChange, activeLeague, onLeagueChange }) => {
  return (
    <aside className="right-sidebar">
      <AuthPanel />

      <div className="sidebar-section">
        <p className="sidebar-label">QUICK FILTERS</p>
        <div className="filter-grid">
          {["All", "Big Clubs", "Safe Picks", "Live Matches", "Goals Picks", "Value Picks", "Upset Alerts"].map(f => (
            <button 
              key={f} 
              className={`filter-tag ${activeFilter === f ? 'active' : ''}`}
              onClick={() => onFilterChange(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-label">GEOGRAPHICAL NODES</p>
        <div className="league-nav">
          <details open>
            <summary>England</summary>
            <button onClick={() => onLeagueChange('Premier League')}>Premier League</button>
            <button onClick={() => onLeagueChange('Championship')}>Championship</button>
          </details>
          <details>
            <summary>Spain</summary>
            <button onClick={() => onLeagueChange('La Liga')}>La Liga</button>
          </details>
          <details>
            <summary>Italy</summary>
            <button onClick={() => onLeagueChange('Serie A')}>Serie A</button>
          </details>
          <details>
            <summary>Germany</summary>
            <button onClick={() => onLeagueChange('Bundesliga')}>Bundesliga</button>
          </details>
          <details>
            <summary>France</summary>
            <button onClick={() => onLeagueChange('Ligue 1')}>Ligue 1</button>
          </details>
          <details>
            <summary>Europe</summary>
            <button onClick={() => onLeagueChange('Champions League')}>Champions League</button>
            <button onClick={() => onLeagueChange('Europa League')}>Europa League</button>
          </details>
          <button className="nav-group-btn">Africa</button>
          <button className="nav-group-btn">Asia</button>
          <button className="nav-group-btn">South America</button>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;