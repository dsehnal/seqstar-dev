/**
 * Browser hosts import this side-effect module once. Keeping the bare package
 * specifier here makes Vite resolve the stylesheet from the wrapper's one
 * pinned Mol* dependency.
 */
import "molstar/build/viewer/molstar.css";
