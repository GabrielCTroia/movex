import { computeCheckedState, toResourceIdentifierObj } from 'movex-core-util';
import {
  gameReducer,
  gameReducerWithDerivedState,
  initialGameState,
  initialRawGameStateWithDerivedState,
  tillNextTick,
} from 'movex-specs-util';
import { movexClientMasterOrchestrator } from './orchestrator';

const orchestrator = movexClientMasterOrchestrator();

beforeEach(async () => {
  await orchestrator.unsubscribe();
});

describe('Public Actions', () => {
  test('Dispatch with 1 client only', async () => {
    const {
      clients: [gameClientResource],
    } = orchestrator.orchestrate({
      clientIds: ['test-client'],
      reducer: gameReducer,
      resourceType: 'game',
    });

    const created = await gameClientResource
      .create(initialGameState)
      .resolveUnwrap();

    expect(created).toEqual({
      rid: toResourceIdentifierObj(created.rid), // The id isn't too important here
      state: initialGameState,
      subscribers: {},
    });

    const movex = gameClientResource.bind(created.rid);

    movex.dispatch({
      type: 'submitMoves',
      payload: {
        moves: ['w:E2-E4'],
        color: 'white',
      },
    });

    await tillNextTick();

    const actual = movex.getUnwrappedState();

    const expected = {
      ...initialGameState,
      submission: {
        ...initialGameState.submission,
        status: 'partial',
        white: {
          moves: ['w:E2-E4'],
          canDraw: false,
        },
      },
    };

    expect(actual).toEqual(expected);
  });

  test('With 2 Clients', async () => {
    const {
      clients: [whiteClient, blackClient],
    } = orchestrator.orchestrate({
      clientIds: ['white-client', 'black-client'],
      reducer: gameReducer,
      resourceType: 'game',
    });

    const { rid } = await whiteClient.create(initialGameState).resolveUnwrap();

    const whiteMovex = whiteClient.bind(rid);
    const blackMovex = blackClient.bind(rid);

    whiteMovex.dispatch({
      type: 'change',
      payload: 5,
    });

    await tillNextTick();

    const expected = {
      checkedState: computeCheckedState({
        ...initialGameState,
        count: 5,
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    // console.log('whiteMovex', whiteMovex.state);
    // console.log('blackMovex', blackMovex.state);

    expect(whiteMovex.get()).toEqual(expected);

    // The black would only be the same as white if the master works
    expect(blackMovex.get()).toEqual(expected);
  });
});

describe('Private Actions', () => {
  test('2 Players - Only 1 Submits', async () => {
    const {
      clients: [whiteClient, blackClient],
    } = orchestrator.orchestrate({
      clientIds: ['white-client', 'black-client'],
      reducer: gameReducer,
      resourceType: 'game',
    });

    const { rid } = await whiteClient.create(initialGameState).resolveUnwrap();

    const whiteMovex = whiteClient.bind(rid);
    const blackMovex = blackClient.bind(rid);

    // White's Turn
    whiteMovex.dispatchPrivate(
      {
        type: 'submitMoves',
        payload: {
          color: 'white',
          moves: ['w:E2-E4', 'w:D2-D4'],
        },
        isPrivate: true,
      },
      {
        type: 'readySubmissionState',
        payload: {
          color: 'white',
        },
      }
    );

    await tillNextTick();

    // This is the sender private
    // White
    const expectedSenderState = {
      checkedState: computeCheckedState({
        ...initialGameState,
        submission: {
          status: 'partial',
          white: {
            canDraw: false,
            moves: ['w:E2-E4', 'w:D2-D4'],
          },
          black: {
            canDraw: true,
            moves: [],
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    // And sender gets the new private state
    const actualSenderState = whiteMovex.get();
    expect(actualSenderState).toEqual(expectedSenderState);

    const publicState = computeCheckedState({
      ...initialGameState,
      submission: {
        status: 'partial',
        white: {
          canDraw: false,
          moves: [],
        },
        black: {
          canDraw: true,
          moves: [],
        },
      },
    });

    // In this case is the same as the public b/c no private changes has been made
    // Black
    const expectedPeerState = {
      checkedState: publicState,
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };
    const actualPeerState = blackMovex.get();

    // Peer gets the new public state
    expect(actualPeerState).toEqual(expectedPeerState);
  });

  test('2 Players – Both Submit (White first). WITHOUT Ability to Reconciliatiate at Reducer', async () => {
    const gameReducerWithoutRecociliation = gameReducer.bind({});
    // Overwrite this to always return false in this test case
    gameReducerWithoutRecociliation.$canReconcileState = () => {
      return false;
    };

    const {
      clients: [whiteClient, blackClient],
    } = orchestrator.orchestrate({
      clientIds: ['white-client', 'black-client'],
      reducer: gameReducerWithoutRecociliation,
      resourceType: 'game',
    });

    const { rid } = await whiteClient.create(initialGameState).resolveUnwrap();

    const whiteMovex = whiteClient.bind(rid);
    const blackMovex = blackClient.bind(rid);

    // White's Turn
    whiteMovex.dispatchPrivate(
      {
        type: 'submitMoves',
        payload: {
          color: 'white',
          moves: ['w:E2-E4', 'w:D2-D4'],
        },
        isPrivate: true,
      },
      {
        type: 'readySubmissionState',
        payload: {
          color: 'white',
        },
      }
    );

    await tillNextTick();

    // This is the sender private
    // White
    const expectedWhiteState = {
      checkedState: computeCheckedState({
        ...initialGameState,
        submission: {
          status: 'partial',
          white: {
            canDraw: false,
            moves: ['w:E2-E4', 'w:D2-D4'],
          },
          black: {
            canDraw: true,
            moves: [],
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    // And sender gets the new private state
    const actualWhiteState = whiteMovex.get();
    expect(actualWhiteState).toEqual(expectedWhiteState);

    // Black's Turn
    blackMovex.dispatchPrivate(
      {
        type: 'submitMoves',
        payload: {
          color: 'black',
          moves: ['b:E7-E6'],
        },
        isPrivate: true,
      },
      {
        type: 'readySubmissionState',
        payload: {
          color: 'black',
        },
      }
    );

    await tillNextTick();

    // White
    const expectedPeerState = {
      checkedState: computeCheckedState({
        ...initialGameState,
        submission: {
          status: 'partial',
          white: {
            canDraw: false,
            moves: ['w:E2-E4', 'w:D2-D4'],
          },
          black: {
            canDraw: false,
            moves: [],
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    const actualPeerState = whiteMovex.get();
    expect(actualPeerState).toEqual(expectedPeerState);

    // Black
    const expectedSenderState = {
      checkedState: computeCheckedState({
        ...initialGameState,
        submission: {
          status: 'partial',
          white: {
            canDraw: false,
            moves: [],
          },
          black: {
            canDraw: false,
            moves: ['b:E7-E6'],
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };
    // The Private Action gets set
    // And sender gets the new private state
    const actualSenderState = blackMovex.get();
    expect(actualSenderState).toEqual(expectedSenderState);
  });

  test('2 Clients. Both Submitting (White first) WITH Reconciliation', async () => {
    const {
      clients: [whiteClient, blackClient],
      master,
    } = orchestrator.orchestrate({
      clientIds: ['white-client', 'black-client'],
      reducer: gameReducerWithDerivedState,
      resourceType: 'game',
    });

    const { rid } = await whiteClient
      .create(initialRawGameStateWithDerivedState)
      .resolveUnwrap();

    const whiteMovex = whiteClient.bind(rid);
    const blackMovex = blackClient.bind(rid);

    // White's Turn
    whiteMovex.dispatchPrivate(
      {
        type: 'submitMoves',
        payload: {
          color: 'white',
          moves: ['w:E2-E4', 'w:D2-D4'],
        },
        isPrivate: true,
      },
      {
        type: 'readySubmissionState',
        payload: {
          color: 'white',
        },
      }
    );

    await tillNextTick();

    // This is the sender private
    // White
    const expectedWhiteState = {
      checkedState: computeCheckedState({
        submission: {
          white: {
            canDraw: false,
            moves: ['w:E2-E4', 'w:D2-D4'],
          },
          black: {
            canDraw: true,
            moves: null,
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    // And sender gets the new private state
    const actualWhiteState = whiteMovex.get();
    expect(actualWhiteState).toEqual(expectedWhiteState);

    // Black's Turn (Reconciliatory Turn)
    blackMovex.dispatchPrivate(
      {
        type: 'submitMoves',
        payload: {
          color: 'black',
          moves: ['b:E7-E6'],
        },
        isPrivate: true,
      },
      {
        type: 'readySubmissionState',
        payload: {
          color: 'black',
        },
      }
    );

    await tillNextTick();

    const expectedState = {
      checkedState: computeCheckedState({
        submission: {
          white: {
            canDraw: false,
            moves: ['w:E2-E4', 'w:D2-D4'],
          },
          black: {
            canDraw: false,
            moves: ['b:E7-E6'],
          },
        },
      }),
      subscribers: {
        'white-client': {
          id: 'white-client',
          info: {},
        },
        'black-client': {
          id: 'black-client',
          info: {},
        },
      },
    };

    // They are bot equal now
    const actualPeerState = whiteMovex.get();
    expect(actualPeerState).toEqual(expectedState);

    const actualSenderState = blackMovex.get();
    expect(actualSenderState).toEqual(expectedState);

    const masterPublicState = await master.getPublicState(rid).resolveUnwrap();
    expect(masterPublicState).toEqual(expectedState.checkedState);

    // expect(actualPeerState[0].submission.status).toBe('reconciled');
  });
  // Test with many more peers
});
