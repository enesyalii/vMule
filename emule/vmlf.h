#pragma once
//
// VMLF is vMule's file-link and UI name for the eD2K-compatible network protocol.
// Wire opcodes (EMULE_PROTOCOL, packet IDs, Kad) stay unchanged so existing
// servers and Kad nodes still interoperate. Users see "VMLF" and vmlf:// links.
//
#ifndef VMLF_LINK_PREFIX
#define VMLF_LINK_PREFIX		_T("vmlf://")
#define VMLF_LINK_PREFIX_A		"vmlf://"
#define ED2K_LINK_PREFIX		_T("ed2k://")
#define ED2K_LINK_PREFIX_A		"ed2k://"
#endif

inline bool IsVmlfOrEd2kScheme(const CString& tok)
{
	return tok.CompareNoCase(VMLF_LINK_PREFIX) == 0 || tok.CompareNoCase(ED2K_LINK_PREFIX) == 0;
}
