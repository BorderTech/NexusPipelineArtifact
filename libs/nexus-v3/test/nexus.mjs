import { nexus } from '../dist/nexus.js';
import assert from 'node:assert';
import * as crypto from 'crypto';

const protocol = 'http';
const host = 'nexus.example.com';
let repoName;
let pathname = `/service/rest/v1/repositories/${repoName}`;
let href = `${protocol}://${host}${pathname}`;

describe('Nexus', function () {
  beforeEach(() => {
    repoName = crypto.randomUUID();
    pathname = `/service/rest/v1/repositories/${repoName}`;
    href = `${protocol}://${host}${pathname}`;
  });

  describe('#getRepositoryInfo()', function () {
    const instance = new nexus();
    let called = 0;
    it('get the repository info via http the first time and cache after that', function () {
      instance.executeRequest = function(urlObject) {
        assert.equal(urlObject.href, href);
        assert.equal(++called, 1);  // This can only ever be called once because of the cache
        return Promise.resolve(`{
            "name": "${repoName}",
            "format": "npm",
            "type": "group",
            "url": "${protocol}://${host}/repository/${repoName}",
            "attributes": {}
        }`);
      };
      return instance.getRepositoryInfo(`${protocol}://${host}`, '', true, repoName).then(() => {
        return instance.getRepositoryInfo(`${protocol}://${host}`, '', true, repoName);
      });
    });
  });

  describe('#buildDownloadUri()', function () {
    let group;
    let name;
    let version;
    let format;
    let instance;

    beforeEach(() => {
      group = `com.example.group.${crypto.randomUUID()}`;
      name = `fizz-buzz-${crypto.randomUUID()}`;
      version = crypto.randomUUID();
      format = 'maven2';
      instance = new nexus();
      instance.executeRequest = function(urlObject) {
        const response = `{
            "name": "${repoName}",
            "format": "${format}",
            "type": "group",
            "url": "${protocol}://${host}/repository/${repoName}",
            "attributes": {}
        }`;
        assert.equal(urlObject.href, href);
        return Promise.resolve(response);
      };
    });

    it('can build a maven download url', function () {
      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        group,
        name,
        version
      ).then((downloadUri) => {
        assert.equal(downloadUri.host, host);
        assert.equal(downloadUri.searchParams.get('repository'), repoName);
        assert.equal(downloadUri.searchParams.get('maven.groupId'), group);
        assert.equal(downloadUri.searchParams.get('maven.artifactId'), name);
        assert.equal(downloadUri.searchParams.get('version'), version);
        assert.equal(downloadUri.searchParams.get('maven.classifier'), '');
        assert.equal(downloadUri.searchParams.size, 5);
      });
    });

    it('can build a maven download url with classifier', function () {
      const classifier = 'pom';
      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        group,
        name,
        version,
        '',
        classifier
      ).then((downloadUri) => {
        assert.equal(downloadUri.host, host);
        assert.equal(downloadUri.searchParams.get('repository'), repoName);
        assert.equal(downloadUri.searchParams.get('maven.groupId'), group);
        assert.equal(downloadUri.searchParams.get('maven.artifactId'), name);
        assert.equal(downloadUri.searchParams.get('version'), version);
        assert.equal(downloadUri.searchParams.get('maven.classifier'), classifier);
        assert.equal(downloadUri.searchParams.size, 5);
      });
    });

    it('demands a group id for maven', function () {
      let errored = false;
      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        '',
        name,
        version
      ).catch(err => {
        errored = true;
      }).then(() => {
        assert.ok(errored);
      });
    });

    it('can build a maven download url with SNAPSHOT version', function () {
      version += '-SNAPSHOT';

      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        group,
        name,
        version
      ).then((downloadUri) => {
        assert.equal(downloadUri.host, host);
        assert.equal(downloadUri.searchParams.get('repository'), repoName);
        assert.equal(downloadUri.searchParams.get('maven.groupId'), group);
        assert.equal(downloadUri.searchParams.get('maven.artifactId'), name);
        assert.equal(downloadUri.searchParams.get('maven.baseVersion'), version);
        assert.equal(downloadUri.searchParams.get('sort'), 'version');
        assert.equal(downloadUri.searchParams.get('maven.classifier'), '');
        assert.equal(downloadUri.searchParams.size, 6);
      });
    });

    it('can build an NPM download url', function () {
      format = 'npm';
      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        group,
        name,
        version
      ).then((downloadUri) => {
        assert.equal(downloadUri.host, host);
        assert.equal(downloadUri.searchParams.get('repository'), repoName);
        assert.equal(downloadUri.searchParams.get('npm.scope'), group);
        assert.equal(downloadUri.searchParams.get('name'), name);
        assert.equal(downloadUri.searchParams.get('version'), version);
        assert.equal(downloadUri.searchParams.size, 4);
      });
    });

    it('dows not demand a scope for npm', function () {
      format = 'npm';
      return instance.buildDownloadUri(
        `${protocol}://${host}`,
        '',
        true,
        repoName,
        '',
        name,
        version
      ).then((downloadUri) => {
        assert.equal(downloadUri.host, host);
        assert.equal(downloadUri.searchParams.get('repository'), repoName);
        assert.equal(downloadUri.searchParams.get('name'), name);
        assert.equal(downloadUri.searchParams.get('version'), version);
        assert.equal(downloadUri.searchParams.size, 3);
      });
    });
  });
});
