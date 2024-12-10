import { nexus } from '../dist/nexus.js';
import assert from 'node:assert';
import * as crypto from 'crypto';

const protocol = 'http';
const host = 'nexus.example.com';
const repoName = crypto.randomUUID();
const pathname = `/service/rest/v1/repositories/${repoName}`;
const href = `${protocol}://${host}${pathname}`;

describe('Nexus', function () {
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
});
