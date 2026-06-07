import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// Use WSSharedDoc definition to avoid circular references if necessary, or just class
class WSSharedDoc extends Y.Doc {
    name: string;
    conns: Map<WebSocket, Set<number>>;
    awareness: awarenessProtocol.Awareness;

    constructor(name: string) {
        super({ gc: true });
        this.name = name;
        this.conns = new Map();
        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);

        const awarenessChangeHandler = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: any) => {
            const changedClients = added.concat(updated, removed);
            const connControlledIds = this.conns.get(origin);
            if (connControlledIds) {
                added.forEach(clientId => connControlledIds.add(clientId));
                removed.forEach(clientId => connControlledIds.delete(clientId));
            }
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1); // messageAwareness
            // Use encodeAwarenessUpdate and write as VarUint8Array because applyAwarenessUpdate expects it
            const buff = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
            encoding.writeVarUint8Array(encoder, buff);

            const message = encoding.toUint8Array(encoder);
            this.conns.forEach((_, c) => send(this, c, message));
        };

        this.awareness.on('update', awarenessChangeHandler);
        this.on('update', updateHandler);
    }
}

const docs = new Map<string, WSSharedDoc>();

// Fix updateHandler signature to match Y.Doc 'update' event
const updateHandler = (update: Uint8Array, origin: any, doc: Y.Doc) => {
    const wsDoc = doc as WSSharedDoc;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    wsDoc.conns.forEach((_, conn) => send(wsDoc, conn, message));
};

const getYDoc = (docname: string, gc: boolean = true): WSSharedDoc => {
    let doc = docs.get(docname);
    if (!doc) {
        doc = new WSSharedDoc(docname);
        doc.gc = gc;
        docs.set(docname, doc);
    }
    return doc;
};

const messageSync = 0;
const messageAwareness = 1;

const closeConn = (doc: WSSharedDoc, conn: WebSocket) => {
    if (doc.conns.has(conn)) {
        const controlledIds = doc.conns.get(conn);
        doc.conns.delete(conn);
        if (controlledIds) {
            awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
        }
        if (doc.conns.size === 0) {
            doc.destroy();
            docs.delete(doc.name);
        }
    }
    // conn.close() shouldn't be called here if it's already closed/closing, but safe enough
    try { conn.close(); } catch (e) { }
};

const send = (doc: WSSharedDoc, conn: WebSocket, m: Uint8Array) => {
    if (conn.readyState !== WebSocket.OPEN) {
        closeConn(doc, conn);
    }
    try {
        conn.send(m, (err: any) => { if (err) closeConn(doc, conn); });
    } catch (e) {
        closeConn(doc, conn);
    }
};

const setupWSConnection = (conn: WebSocket, req: any, { docName = req.url.slice(1).split('?')[0], gc = true }: { docName?: string; gc?: boolean } = {}) => {
    conn.binaryType = 'arraybuffer';
    const doc = getYDoc(docName, gc);
    doc.conns.set(conn, new Set());

    conn.on('message', (message: ArrayBuffer) => {
        try {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);
            switch (messageType) {
                case messageSync:
                    encoding.writeVarUint(encoder, messageSync);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                    if (encoding.length(encoder) > 1) {
                        send(doc, conn, encoding.toUint8Array(encoder));
                    }
                    break;
                case messageAwareness:
                    // readVarUint8Array reads the buffer written by writeVarUint8Array
                    awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
                    break;
            }
        } catch (err) {
            console.error(err);
            // remove emit('error') as it might not be standard on Y.Doc in types
        }
    });

    conn.on('close', () => {
        closeConn(doc, conn);
    });

    // Initial sync
    {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep1(encoder, doc);
        send(doc, conn, encoding.toUint8Array(encoder));

        const awarenessStates = doc.awareness.getStates();
        if (awarenessStates.size > 0) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAwareness);
            const buff = awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()));
            encoding.writeVarUint8Array(encoder, buff);
            send(doc, conn, encoding.toUint8Array(encoder));
        }
    }
};

export { setupWSConnection, docs };
