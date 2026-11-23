import { mount } from 'svelte';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { applyTheme, readTheme, safeStorage } from './theme.js';

// Apply the saved theme before the first paint so the Studio never flashes the wrong one.
applyTheme(document.documentElement, readTheme(safeStorage()));

const target = document.getElementById('app');
if (!target) throw new Error('Missing application root');
mount(App, { target });
