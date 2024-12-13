import tl = require('azure-pipelines-task-lib/task');
import path = require('path');
import { IhttpHelper } from './IhttpHelper';
import { httpHelper } from './httpHelper';
import cache = require('persistent-cache');
const helper: IhttpHelper = new httpHelper();
const infoCache = cache();

const defaultRepoType = 'maven2';
const parameterMap = {
  maven2: {
    repository: {
      name: 'repository',
      required: true,
    },
    group: {
      name: 'maven.groupId',
      required: true,
    },
    artifact: {
      name: 'maven.artifactId',
      required: true,
    },
    // packaging is not even used!
    packaging: {
      name: 'packaging',
      required: false,
    },
    classifier: {
      name: 'maven.classifier',
      required: false,
      defaultVal: '',
    },
    extension: {
      name: 'maven.extension',
      required: false,
    },
  },
  npm: {
    repository: {
      name: 'repository',
      required: true,
    },
    group: {
      name: 'npm.scope',
      required: false,
    },
    artifact: {
      name: 'name',
      required: true,
    },
  },
  nuget: {
    repository: {
      name: 'repository',
      required: true,
    },
    artifact: {
      name: 'nuget.id',
      required: true,
    },
  },
};

export class nexus {
  public async downloadAsset(
    nexusUrl: string,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean,
    repository: string,
    group: string,
    artifact: string,
    version: string,
    extension?: string,
    packaging?: string,
    classifier?: string
  ): Promise<void> {
    const hostUri = await this.buildDownloadUri(
      nexusUrl,
      auth,
      acceptUntrustedCerts,
      repository,
      group,
      artifact,
      version,
      extension,
      classifier
    );

    console.log(`Download asset using '${hostUri}'.`);
    // Execute the request
    await this.executeRequest(hostUri, auth, acceptUntrustedCerts);
    console.log(`Completed download asset using '${hostUri}'.`);
  }

  protected async buildDownloadUri(
    nexusUrl: string,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean,
    repository: string,
    group: string,
    artifact: string,
    version: string,
    extension?: string,
    classifier?: string
  ): Promise<URL> {
    const repoInfo = await this.getRepositoryInfo(
      nexusUrl,
      auth,
      acceptUntrustedCerts,
      repository
    );
    const repoType = repoInfo['format'] || defaultRepoType;
    const pmap = parameterMap[repoType] || parameterMap[defaultRepoType];

    // Build the final download uri
    const hostUri = this.getApiUrl(nexusUrl, '/search/assets/download');
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api

    // *** ONLY Works in Nexus 3.16+ ***
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api#SearchAPI-DownloadingtheLatestVersionofanAsset
    // We could use /service/rest/v1/status and look at the response header "server: Nexus/3.21.1-01 (OSS)"
    // hostUri.searchParams.append("sort", "version");
    // *** ONLY Works in Nexus 3.16+ ***
    const errors = [];

    const addParameterToUri = (parameterName, paramValue) => {
      const pInfo = pmap[parameterName];
      if (pInfo) {
        // eslint-disable-next-line no-prototype-builtins
        if (paramValue || pInfo.hasOwnProperty('defaultVal')) {
          const value = paramValue || pInfo.defaultVal;
          hostUri.searchParams.append(pInfo.name, value);
        } else if (pInfo.required) {
          errors.push(`The '${parameterName}' parameter is required!`);
        }
      } else {
        console.log(`Ignoring '${parameterName}' for repo type '${repoType}'`);
      }
    };

    addParameterToUri('repository', repository);
    addParameterToUri('group', group);
    addParameterToUri('artifact', artifact);
    addParameterToUri('extension', extension);
    addParameterToUri('classifier', classifier);

    if (version) {
      // not every type of package needs a version
      if (this.isSnapshot(version)) {
        hostUri.searchParams.append('maven.baseVersion', version);
        hostUri.searchParams.set('sort', 'version');
      } else {
        hostUri.searchParams.append('version', version);
      }
    }

    if (errors.length) {
      return Promise.reject(errors.join('\n'));
    }

    return Promise.resolve(hostUri);
  }

  private isSnapshot(version: string): boolean {
    return /-SNAPSHOT$/.test(version);
  }

  private getApiUrl(nexusUrl: string, apiPath: string) {
    const hostUri = new URL(nexusUrl);
    let requestPath = path.join('/service/rest/v1', apiPath);
    if (hostUri.pathname !== '/') {
      requestPath = path.join(hostUri.pathname, requestPath);
    }
    hostUri.pathname = requestPath;
    return hostUri;
  }

  private async executeRequest(
    hostUri: URL,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean
  ): Promise<string> {
    let responseContent: string;
    try {
      if (hostUri.protocol === 'https:') {
        if (auth.scheme === 'UsernamePassword') {
          responseContent = await helper.execute_https(
            hostUri,
            acceptUntrustedCerts,
            auth.parameters['username'],
            auth.parameters['password']
          );
        } else {
          responseContent = await helper.execute_https(
            hostUri,
            acceptUntrustedCerts
          );
        }
      } else {
        if (auth.scheme === 'UsernamePassword') {
          responseContent = await helper.execute_http(
            hostUri,
            auth.parameters['username'],
            auth.parameters['password']
          );
        } else {
          responseContent = await helper.execute_http(hostUri);
        }
      }
    } catch (inner_err) {
      console.log(`Failed to execute request '${hostUri}'.`);
      throw inner_err;
    }
    console.log('Got responseContent', responseContent);
    return responseContent;
  }

  public async getRepositoryInfo(
    nexusUrl: string,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean,
    repository: string
  ) {
    const hostUri = this.getApiUrl(nexusUrl, `/repositories/${repository}`);

    return new Promise((win, lose) => {
      infoCache.get(hostUri.href, (err, responseContent) => {
        if (err) {
          return lose(err);
        }
        if (responseContent) {
          console.log('Got repository information from cache:', hostUri.href);
          return win(JSON.parse(<string>responseContent));
        }
        console.log(
          'Cache miss fetching repository information:',
          hostUri.href
        );
        this.executeRequest(hostUri, auth, acceptUntrustedCerts).then(
          (responseContent) => {
            infoCache.put(hostUri.href, responseContent, () =>
              win(JSON.parse(<string>responseContent))
            );
          }
        );
      });
    });
  }
}
