import './env.js';
import { app } from './app.js';

const port = process.env.API_PORT || 4000;
app.listen(port, () => {
  console.log(`Parish Members Online Registry API listening on port ${port}`);
});
