import { buildSchema } from 'graphql';
import fs from 'fs';
import path from 'path';

const sdlPath = path.resolve(__dirname, 'schema.graphql');
const sdl = fs.readFileSync(sdlPath, 'utf8');

export const schema = buildSchema(sdl);
