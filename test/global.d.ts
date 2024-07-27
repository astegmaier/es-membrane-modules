declare namespace NodeJS {
  export interface ProcessEnv {
    /** 
     * A custom flag that we are setting withing settings.json
     * to allow tests to tell that they are being run by VSCode's Jest plugin. 
     */
    VS_CODE_JEST?: string;
  }
}
