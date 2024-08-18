// import { reducer as rpsReducer } from "./movex";
import { speedPushGameReducer } from 'movex-specs-util';

// The idea of this is so both the server and the client can read it
// Obviosuly being a node/js env helps a lot :)

export default {
  resources: {
    speedPushGame: speedPushGameReducer,
  },
};
