import { GetObjectAclCommand, Grant, ListObjectsV2CommandInput, paginateListObjectsV2, S3Client } from '@aws-sdk/client-s3';


export async function* getObjectMatchingAcls(bucketName: string, acls: string[], prefix?: string): AsyncGenerator<{ key: string; acls: string[] }> {
  const client = new S3Client({});
  for await (const objKey of getObjectsInBucket(client, bucketName, prefix)) {
    // Get object acls
    const objGrants = await getObjectAclGrants(client, bucketName, objKey);

    // Perform checks against the selected acls
    let matchingAcls: string[] = [];
    for (const acl of acls) {
      if (mapTesterFuncToCannedAclName(acl)(objGrants!) === true) {
        matchingAcls.push(acl);
      }
    }
    if (matchingAcls.length) {
      yield { key: objKey, acls: matchingAcls };
    }
  }
}

function testGrantsForPublicRead(grants: Grant[]): boolean {
  for (let g of grants) {
    if (g.Permission === 'READ' && g.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers') {
      return true;
    }
  }
  return false;
}

function testGrantsForPublicReadWrite(grants: Grant[]): boolean {
  for (let g of grants) {
    if (g.Permission === 'WRITE' && g.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers') {
      return true;
    }
  }
  return false;
}

function mapTesterFuncToCannedAclName(aclName: string): (grants: Grant[]) => boolean {
  switch (aclName) {
    case 'public-read':
      return testGrantsForPublicRead;
    case 'public-read-write':
      return testGrantsForPublicReadWrite;
    default:
      throw new Error(`acl with name '${aclName}' is not supported`);
  }
}


async function getObjectAclGrants(client: S3Client, bucketName: string, objectKey: string): Promise<Grant[]> {
  const resp = await client.send(new GetObjectAclCommand({
    Bucket: bucketName,
    Key: objectKey,
  }));
  return resp.Grants || Promise.resolve([]);
}


async function* getObjectsInBucket(client: S3Client, bucketName: string, prefix?: string): AsyncGenerator<string> {
  const paginatorConfig = {
    client: client,
    pageSize: 100,
    prefix: prefix,
  };
  const commandParams: ListObjectsV2CommandInput = {
    Bucket: bucketName,
  };
  const paginator = paginateListObjectsV2(paginatorConfig, commandParams);

  for await (const page of paginator) {
    if (!page.Contents) {
      continue;
    }
    for (const k of page.Contents.map(v => v.Key!)) {
      yield k;
    }
  }
}
