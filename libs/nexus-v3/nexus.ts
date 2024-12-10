import tl = require('azure-pipelines-task-lib/task');
import path = require('path');
import { IhttpHelper } from './IhttpHelper';
import { httpHelper } from './httpHelper';
import cache = require('persistent-cache');
const helper: IhttpHelper = new httpHelper();
const infoCache = cache();

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
    // Build the final download uri

    const hostUri = this.getApiUrl(
      nexusUrl,
      auth,
      acceptUntrustedCerts,
      repository,
      '/search/assets/download'
    );
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api

    // *** ONLY Works in Nexus 3.16+ ***
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api#SearchAPI-DownloadingtheLatestVersionofanAsset
    // We could use /service/rest/v1/status and look at the response header "server: Nexus/3.21.1-01 (OSS)"
    // hostUri.searchParams.append("sort", "version");
    // *** ONLY Works in Nexus 3.16+ ***

    hostUri.searchParams.append('repository', repository);
    if (this.hasValue(group)) {
      hostUri.searchParams.append('group', group);
    }
    hostUri.searchParams.append('name', artifact);

    if (this.hasValue(extension)) {
      hostUri.searchParams.append('maven.extension', extension);
    }

    // hostUri.searchParams.append('maven.classifier', '');

    if (this.hasValue(classifier)) {
      hostUri.searchParams.set('maven.classifier', classifier);
    }
    // switch to the "version" criteria, should work in the case of release and snapshot versions

    if (this.isSnapshot(version)) {
      hostUri.searchParams.append('maven.baseVersion', version);
      hostUri.searchParams.set('sort', 'version');
    } else {
      hostUri.searchParams.append('version', version);
    }

    console.log(`Download asset using '${hostUri}'.`);
    // Execute the request
    await this.executeRequest(hostUri, auth, acceptUntrustedCerts);
    console.log(`Completed download asset using '${hostUri}'.`);
  }

  private isSnapshot(version: string): boolean {
    return /-SNAPSHOT$/.test(version);
  }

  private getApiUrl(
    nexusUrl: string,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean,
    repository: string,
    apiPath: string
  ) {
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
    const hostUri = this.getApiUrl(
      nexusUrl,
      auth,
      acceptUntrustedCerts,
      repository,
      `/repositories/${repository}`
    );

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

  public hasValue(param) {
    return param && !/^\s*-\s*$/.test(param);
  }
}
