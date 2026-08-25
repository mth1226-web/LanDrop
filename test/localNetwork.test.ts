import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickLanAddress, listLanInterfaces } from '../src/main/localNetwork'
import type os from 'node:os'

function iface(address: string, family: 'IPv4' | 'IPv6', internal: boolean): os.NetworkInterfaceInfo {
  return { address, family, internal } as os.NetworkInterfaceInfo
}

test('内部・ループバックを除いた最初のIPv4を返す', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    lo: [iface('127.0.0.1', 'IPv4', true)],
    'Wi-Fi': [iface('fe80::1', 'IPv6', false), iface('192.168.1.20', 'IPv4', false)]
  }
  assert.equal(pickLanAddress(interfaces), '192.168.1.20')
})

test('IPv4のLANアドレスが無ければnullを返す', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    lo: [iface('127.0.0.1', 'IPv4', true)]
  }
  assert.equal(pickLanAddress(interfaces), null)
})

test('undefinedなインターフェースエントリは無視する', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    ghost: undefined,
    'Wi-Fi': [iface('10.0.0.5', 'IPv4', false)]
  }
  assert.equal(pickLanAddress(interfaces), '10.0.0.5')
})

test('listLanInterfacesはWi-Fi/有線など複数のインターフェースを列挙する', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    lo: [iface('127.0.0.1', 'IPv4', true)],
    'Wi-Fi': [iface('192.168.1.20', 'IPv4', false)],
    Ethernet: [iface('192.168.1.30', 'IPv4', false)]
  }
  assert.deepEqual(listLanInterfaces(interfaces), [
    { name: 'Wi-Fi', address: '192.168.1.20' },
    { name: 'Ethernet', address: '192.168.1.30' }
  ])
})

test('pickLanAddressはpreferredNameで指定したインターフェースを優先する', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    'Wi-Fi': [iface('192.168.1.20', 'IPv4', false)],
    Ethernet: [iface('192.168.1.30', 'IPv4', false)]
  }
  assert.equal(pickLanAddress(interfaces, 'Ethernet'), '192.168.1.30')
  assert.equal(pickLanAddress(interfaces, 'Wi-Fi'), '192.168.1.20')
})

test('pickLanAddressはpreferredNameが見つからない場合、最初のものにフォールバックする', () => {
  const interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    'Wi-Fi': [iface('192.168.1.20', 'IPv4', false)]
  }
  assert.equal(pickLanAddress(interfaces, '存在しないNIC'), '192.168.1.20')
})
