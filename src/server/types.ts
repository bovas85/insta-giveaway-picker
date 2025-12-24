export interface Config {
  postUrl: string;
  competitors: string[];
}

export interface FacebookPage {
  instagram_business_account?: {
    id: string;
    username?: string;
  };
  name?: string;
  id?: string;
  status?: string;
  permission?: string;
}

export interface AnalysisResult {
  winner?: string;
  profile?: string;
  qualified?: string[];
  duration?: number;
  error?: string;
}

export interface InstagramInternalUser {
  username: string;
  pk?: string;
  full_name?: string;
  is_private?: boolean;
}

export interface ActiveSession {
  id: string;
  url: string;
  startTime: string;
  competitors: number;
}
