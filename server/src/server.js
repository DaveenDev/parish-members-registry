import './env.js';
import { app } from './app.js';

// PORT is what Render, Railway, Heroku and friends inject; API_PORT is the
// local convention. Host wins, so no deployment needs extra configuration.
const port = process.env.PORT || process.env.API_PORT || 4000;

app.listen(port, () => {
  console.log(`Parish Members Online Registry API listening on port ${port}`);
});
