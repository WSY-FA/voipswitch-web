export function indexRegistration(registrations, item) {
  registrations.set(
    `${item.domain_id}:endpoint:${item.endpoint_id}`,
    item
  );
  if (item.number) {
    registrations.set(
      `${item.domain_id}:number:${item.number}`,
      item
    );
  }
}

export function findRegistration(registrations, domainId, extension) {
  return registrations.get(`${domainId}:endpoint:${extension.id}`)
    || registrations.get(`${domainId}:number:${extension.number}`);
}
