const fs = require('fs');
const zlib = require('zlib');

let fileStr = '';

if (fs.existsSync('dump.sql')) {
    fileStr = fs.readFileSync('dump.sql', 'utf8');
} else if (fs.existsSync('dump.sql.gz')) {
    const raw = fs.readFileSync('dump.sql.gz');
    fileStr = zlib.gunzipSync(raw).toString('utf8');
} else {
    console.error('dump.sql or dump.sql.gz not found in the current directory!');
    process.exit(1);
}

const lines = fileStr.split('\n');
const publicSchemaLines = [];

let inPublicSchema = false;
let inCopy = false;
let copyTable = '';
let copyColumns = '';
let inserts = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect public schema commands
    if (line.startsWith('-- Name:') && line.includes('Schema: public;')) {
        inPublicSchema = true;
    } else if (line.startsWith('-- Name:') && line.includes('Schema:') && !line.includes('Schema: public;')) {
        inPublicSchema = false;
    }

    if (inPublicSchema) {
        if (line.startsWith('COPY public.')) {
            inCopy = true;
            // COPY public.adds (id, ad_type, ...) FROM stdin;
            const match = line.match(/^COPY public\.([a-zA-Z0-9_]+) \((.+)\) FROM stdin;/);
            if (match) {
                copyTable = match[1];
                copyColumns = match[2];
            }
        } else if (inCopy) {
            if (line.trim() === '\\.') {
                inCopy = false;
            } else if (line.trim() !== '') {
                const values = line.split('\t').map(val => {
                    if (val === '\\N') return 'NULL';
                    // Escape single quotes
                    val = val.replace(/'/g, "''");
                    return `'${val}'`;
                });
                inserts.push(`INSERT INTO public.${copyTable} (${copyColumns}) VALUES (${values.join(', ')});`);
            }
        } else if (!line.startsWith('--') && !line.startsWith('ALTER TABLE ONLY public') && !line.startsWith('SET') && !line.startsWith('SELECT') && !line.startsWith('ALTER DEFAULT PRIVILEGES') && !line.includes('OWNER TO')) {
            // Keep CREATE TABLE and INSERTs, skip comments and generic SETs.
            if (line.trim().length > 0) {
              publicSchemaLines.push(line);
            }
        } else if (line.startsWith('ALTER TABLE ONLY public')) {
            // We want constraints too
            publicSchemaLines.push(line);
        }
    }
}

let output = "-- CLEAN BACKUP FOR PUBLIC SCHEMA\n\n";
output += publicSchemaLines.join('\n') + '\n\n';
output += "-- DATA INSERTS\n";
output += inserts.join('\n') + '\n';

fs.writeFileSync('clean-backup.sql', output, 'utf8');
console.log('Successfully generated clean-backup.sql! You can now paste this into your Supabase SQL Editor.');
