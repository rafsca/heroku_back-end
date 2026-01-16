import express from 'express';
import cors from 'cors';
import { graphqlHTTP } from 'express-graphql';
import dotenv from 'dotenv';
import { schema } from './schema';
import { root } from './resolvers';
import { getUserFromReq } from './authMiddleware';
import basicAuth from './middleware/basicAuth';

dotenv.config();

const app = express();

// Enable CORS for the Angular dev server (adjust origin for production)
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:4200', credentials: true }));

// Apply basic/Bearer auth middleware to GraphQL endpoint. The middleware will attach
// req.basicUser if Basic auth succeeded; JWT Bearer tokens are still allowed through.
app.use('/graphql', basicAuth, (req, res) => {
    const basicUser = (req as any).basicUser;
    const jwtUser = getUserFromReq(req as any);
    const user = basicUser || jwtUser || null;
    return graphqlHTTP({ schema, rootValue: root, graphiql: true, context: { user } })(req, res);
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Server ready at http://localhost:${port}/graphql`);
});
