# Ecommerce Backend (Node.js + TypeScript + GraphQL + MySQL)

Backend per un'applicazione e-commerce sviluppata con:
- **Node.js** & **TypeScript**
- **Express**
- **Express-GraphQL** (Schema-first approach)
- **MySQL** (collegato tramite driver `mysql2`, testato su AWS RDS)
- **JWT** per l'autenticazione

## Funzionalità principali

- **Autenticazione**: Login e Registrazione con rilascio di token JWT.
- **Prodotti**: Query per lista prodotti, filtrazione per categoria (schema supportato). Mutation per creazione prodotti (Admin).
- **Carrello**: Gestione persistente del carrello su database MySQL (tabella `cart_items`).
  - `addToCart`: Aggiunge prodotti o incrementa quantità, con gestione automatica della duplicazione.
  - `cart`: Recupera il carrello utente popolando i dettagli del prodotto.
  - `removeFromCart`: Rimuove item.
  - `clearCart`: Svuota il carrello dopo l'ordine.
- **Ordini**: Creazione ordini collegati all'utente.
- **Database**: Auto-migrazione delle tabelle essenziali all'avvio (`ensureDbSchema`) e gestione compatibilità SSL.

## Configurazione e Avvio

1. **Installazione dipendenze**:
   ```bash
   npm install
   ```

2. **Configurazione Ambiente**:
   Crea un file `.env` nella root con le seguenti variabili:
   ```env
   DATABASE_URL="mysql://user:password@host:3306/database"
   JWT_SECRET="tua_chiave_segreta"
   PORT=4000
   ```
   *Nota: Il sistema supporta connessioni SSL per database remoti.*

3. **Inizializzazione Database (Seed)**:
   Per creare le tabelle e inserire dati di prova (Admin user, Prodotti demo):
   ```bash
   npm run seed
   ```

4. **Avvio Server**:
   ```bash
   npm run dev
   ```

Il server sarà attivo su `http://localhost:4000`.
Endpoint GraphQL: `http://localhost:4000/graphql`
GraphiQL (interfaccia test): Disponibile allo stesso indirizzo.

