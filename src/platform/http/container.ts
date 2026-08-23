import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import type { Clock } from "@/domain/ports";
import { Argon2PasswordHasher } from "@/infra/crypto";
import { TotpMfaProvider } from "@/infra/crypto";
import { OutboxMailProvider } from "@/infra/mail";
import {
  createDb,
  createPool,
  DrizzleUnitOfWork,
  type DbTx,
  DrizzleAuditWriter,
  DrizzleUserRepository,
  DrizzleSessionRepository,
  DrizzleUserRoleRepository,
  DrizzleEmailVerificationTokenRepository,
  DrizzlePasswordResetTokenRepository,
  DrizzleLoginAttemptRepository,
  DrizzleMfaRecoveryCodeRepository,
  DrizzleGameRepository,
  DrizzleTournamentRepository,
  DrizzleTeamRepository,
  DrizzleMatchRepository,
  DrizzleMarketTypeRepository,
  DrizzleEconomicProfileRepository,
  DrizzleMarketRepository,
  DrizzleStreamerRepository,
  DrizzleOutcomeRepository,
  RateLimiter,
} from "@/infra/db";
import { loadConfig, type Config } from "@/platform/config";
import { SessionService } from "@/platform/session";
import {
  RegisterUseCase,
  VerifyEmailUseCase,
  LoginUseCase,
  ListSessionsUseCase,
  RevokeSessionUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
  DisableMfaUseCase,
  EnrollMfaUseCase,
  RedeemMfaRecoveryCodeUseCase,
  VerifyMfaUseCase,
} from "@/application/identity";
import {
  ListGamesUseCase,
  GetGameUseCase,
  ListMatchesUseCase,
  GetMatchUseCase,
  ListMarketsUseCase,
  GetMarketUseCase,
  ListStreamersUseCase,
  GetStreamerUseCase,
  GetMarketBookUseCase,
  CreateGameUseCase,
  CreateGameModeUseCase,
  CreateTournamentUseCase,
  CreateTeamUseCase,
  CreateMatchUseCase,
  AddMatchParticipantUseCase,
  CreateMarketTypeUseCase,
  CreateEconomicProfileUseCase,
  CreateStreamerUseCase,
  UpdateStreamerCommissionUseCase,
  CreateStreamerChannelUseCase,
  CreateMarketUseCase,
  TransitionMarketUseCase,
  CloseMarketsUseCase,
} from "@/application/catalog";

export interface Container {
  readonly config: Config;
  readonly clock: Clock;
  readonly uow: DrizzleUnitOfWork;
  readonly users: (tx: DbTx) => DrizzleUserRepository;
  readonly userRoles: (tx: DbTx) => DrizzleUserRoleRepository;
  readonly sessions: (tx: DbTx) => DrizzleSessionRepository;
  readonly sessionService: SessionService<DbTx>;
  readonly rateLimiter: RateLimiter;
  readonly audit: DrizzleAuditWriter;
  readonly register: RegisterUseCase<DbTx>;
  readonly verifyEmail: VerifyEmailUseCase<DbTx>;
  readonly login: LoginUseCase<DbTx>;
  readonly listSessions: ListSessionsUseCase<DbTx>;
  readonly revokeSession: RevokeSessionUseCase<DbTx>;
  readonly forgotPassword: ForgotPasswordUseCase<DbTx>;
  readonly resetPassword: ResetPasswordUseCase<DbTx>;
  readonly enrollMfa: EnrollMfaUseCase<DbTx>;
  readonly verifyMfa: VerifyMfaUseCase<DbTx>;
  readonly disableMfa: DisableMfaUseCase<DbTx>;
  readonly redeemMfaRecoveryCode: RedeemMfaRecoveryCodeUseCase<DbTx>;
  readonly games: (tx: DbTx) => DrizzleGameRepository;
  readonly tournaments: (tx: DbTx) => DrizzleTournamentRepository;
  readonly teams: (tx: DbTx) => DrizzleTeamRepository;
  readonly matches: (tx: DbTx) => DrizzleMatchRepository;
  readonly marketTypes: (tx: DbTx) => DrizzleMarketTypeRepository;
  readonly economicProfiles: (tx: DbTx) => DrizzleEconomicProfileRepository;
  readonly markets: (tx: DbTx) => DrizzleMarketRepository;
  readonly streamers: (tx: DbTx) => DrizzleStreamerRepository;
  readonly outcomes: (tx: DbTx) => DrizzleOutcomeRepository;
  readonly listGames: ListGamesUseCase<DbTx>;
  readonly getGame: GetGameUseCase<DbTx>;
  readonly listMatches: ListMatchesUseCase<DbTx>;
  readonly getMatch: GetMatchUseCase<DbTx>;
  readonly listMarkets: ListMarketsUseCase<DbTx>;
  readonly getMarket: GetMarketUseCase<DbTx>;
  readonly listStreamers: ListStreamersUseCase<DbTx>;
  readonly getStreamer: GetStreamerUseCase<DbTx>;
  readonly getMarketBook: GetMarketBookUseCase<DbTx>;
  readonly createGame: CreateGameUseCase<DbTx>;
  readonly createGameMode: CreateGameModeUseCase<DbTx>;
  readonly createTournament: CreateTournamentUseCase<DbTx>;
  readonly createTeam: CreateTeamUseCase<DbTx>;
  readonly createMatch: CreateMatchUseCase<DbTx>;
  readonly addMatchParticipant: AddMatchParticipantUseCase<DbTx>;
  readonly createMarketType: CreateMarketTypeUseCase<DbTx>;
  readonly createEconomicProfile: CreateEconomicProfileUseCase<DbTx>;
  readonly createStreamer: CreateStreamerUseCase<DbTx>;
  readonly updateStreamerCommission: UpdateStreamerCommissionUseCase<DbTx>;
  readonly createStreamerChannel: CreateStreamerChannelUseCase<DbTx>;
  readonly createMarket: CreateMarketUseCase<DbTx>;
  readonly transitionMarket: TransitionMarketUseCase<DbTx>;
  readonly closeMarkets: CloseMarketsUseCase<DbTx>;
}

let cached: Container | undefined;

/**
 * One process-lifetime composition root for every src/app/api/** route (T-316).
 * Built lazily so importing this module never opens a pool at build time
 * (Next.js statically analyses route files during `next build`).
 */
export function getContainer(): Container {
  if (cached) {
    return cached;
  }

  const config = loadConfig();
  const pool = createPool(config);
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const passwordHasher = new Argon2PasswordHasher({
    memoryCost: config.ARGON2_MEMORY_COST,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
  });
  const mfa = new TotpMfaProvider(config.MFA_ISSUER);
  const mail = new OutboxMailProvider();
  const audit = new DrizzleAuditWriter();

  const users = (tx: DbTx) => new DrizzleUserRepository(tx);
  const userRoles = (tx: DbTx) => new DrizzleUserRoleRepository(tx);
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);
  const verificationTokens = (tx: DbTx) => new DrizzleEmailVerificationTokenRepository(tx);
  const resetTokens = (tx: DbTx) => new DrizzlePasswordResetTokenRepository(tx);
  const loginAttempts = (tx: DbTx) => new DrizzleLoginAttemptRepository(tx);
  const recoveryCodes = (tx: DbTx) => new DrizzleMfaRecoveryCodeRepository(tx);
  const games = (tx: DbTx) => new DrizzleGameRepository(tx);
  const tournaments = (tx: DbTx) => new DrizzleTournamentRepository(tx);
  const teams = (tx: DbTx) => new DrizzleTeamRepository(tx);
  const matches = (tx: DbTx) => new DrizzleMatchRepository(tx);
  const marketTypes = (tx: DbTx) => new DrizzleMarketTypeRepository(tx);
  const economicProfiles = (tx: DbTx) => new DrizzleEconomicProfileRepository(tx);
  const markets = (tx: DbTx) => new DrizzleMarketRepository(tx);
  const streamers = (tx: DbTx) => new DrizzleStreamerRepository(tx);
  const outcomes = (tx: DbTx) => new DrizzleOutcomeRepository(tx);

  const transitionMarket = new TransitionMarketUseCase<DbTx>({
    uow,
    markets,
    outcomes,
    clock,
    audit,
  });

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions,
    ids,
    clock,
    config: {
      ttlHours: config.SESSION_TTL_HOURS,
      idleTimeoutHours: config.SESSION_IDLE_TIMEOUT_HOURS,
    },
  });

  const mfaDeps = {
    uow,
    users,
    recoveryCodes,
    sessions,
    mfa,
    passwordHasher,
    ids,
    clock,
    encryptionKey: config.ENCRYPTION_KEY,
    audit,
  };

  cached = {
    config,
    clock,
    uow,
    users,
    userRoles,
    sessions,
    sessionService,
    rateLimiter: new RateLimiter(clock, ids),
    audit,
    register: new RegisterUseCase<DbTx>({
      uow,
      users,
      verificationTokens,
      passwordHasher,
      mail,
      ids,
      clock,
      audit,
    }),
    verifyEmail: new VerifyEmailUseCase<DbTx>({ uow, users, verificationTokens, clock, audit }),
    login: new LoginUseCase<DbTx>({ uow, users, loginAttempts, passwordHasher, clock, audit }),
    listSessions: new ListSessionsUseCase<DbTx>({ uow, sessions, clock }),
    revokeSession: new RevokeSessionUseCase<DbTx>({ uow, sessions, clock, audit }),
    forgotPassword: new ForgotPasswordUseCase<DbTx>({ uow, users, resetTokens, mail, ids, clock }),
    resetPassword: new ResetPasswordUseCase<DbTx>({
      uow,
      users,
      resetTokens,
      sessions,
      passwordHasher,
      clock,
      audit,
    }),
    enrollMfa: new EnrollMfaUseCase<DbTx>(mfaDeps),
    verifyMfa: new VerifyMfaUseCase<DbTx>(mfaDeps),
    disableMfa: new DisableMfaUseCase<DbTx>(mfaDeps),
    redeemMfaRecoveryCode: new RedeemMfaRecoveryCodeUseCase<DbTx>(mfaDeps),
    games,
    tournaments,
    teams,
    matches,
    marketTypes,
    economicProfiles,
    markets,
    streamers,
    outcomes,
    listGames: new ListGamesUseCase<DbTx>({ uow, games }),
    getGame: new GetGameUseCase<DbTx>({ uow, games }),
    listMatches: new ListMatchesUseCase<DbTx>({ uow, matches }),
    getMatch: new GetMatchUseCase<DbTx>({ uow, matches }),
    listMarkets: new ListMarketsUseCase<DbTx>({ uow, markets }),
    getMarket: new GetMarketUseCase<DbTx>({ uow, markets }),
    listStreamers: new ListStreamersUseCase<DbTx>({ uow, streamers }),
    getStreamer: new GetStreamerUseCase<DbTx>({ uow, streamers }),
    getMarketBook: new GetMarketBookUseCase<DbTx>({ uow, markets, outcomes }),
    createGame: new CreateGameUseCase<DbTx>({ uow, games, ids, audit }),
    createGameMode: new CreateGameModeUseCase<DbTx>({ uow, games, ids, audit }),
    createTournament: new CreateTournamentUseCase<DbTx>({ uow, games, tournaments, ids, audit }),
    createTeam: new CreateTeamUseCase<DbTx>({ uow, games, teams, ids, audit }),
    createMatch: new CreateMatchUseCase<DbTx>({ uow, tournaments, matches, ids, audit }),
    addMatchParticipant: new AddMatchParticipantUseCase<DbTx>({ uow, matches, teams, audit }),
    createMarketType: new CreateMarketTypeUseCase<DbTx>({ uow, marketTypes, ids, audit }),
    createEconomicProfile: new CreateEconomicProfileUseCase<DbTx>({
      uow,
      economicProfiles,
      ids,
      audit,
    }),
    createStreamer: new CreateStreamerUseCase<DbTx>({ uow, users, streamers, ids, audit }),
    updateStreamerCommission: new UpdateStreamerCommissionUseCase<DbTx>({
      uow,
      streamers,
      audit,
    }),
    createStreamerChannel: new CreateStreamerChannelUseCase<DbTx>({
      uow,
      streamers,
      ids,
      audit,
    }),
    createMarket: new CreateMarketUseCase<DbTx>({
      uow,
      matches,
      marketTypes,
      streamers,
      economicProfiles,
      markets,
      outcomes,
      ids,
      audit,
    }),
    transitionMarket,
    closeMarkets: new CloseMarketsUseCase<DbTx>({ uow, markets, transitionMarket, clock }),
  };

  return cached;
}
