export type RepositoryPath = string;

export interface ComponentFingerprintOptions {
  repositoryRoot?: string;
}

export interface ServerComponentFingerprints {
  app: string;
  dataTools: string;
  flyway: string;
}
