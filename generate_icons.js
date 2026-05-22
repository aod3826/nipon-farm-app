import fs from 'fs';
import { createCanvas, Image } from 'canvas';
import { loadDocument } from 'jsdom';

// Wait, node canvas doesn't render SVG out of the box without rsvg in many environments,
// but we can try generic html5 canvas or pure js resvg.
