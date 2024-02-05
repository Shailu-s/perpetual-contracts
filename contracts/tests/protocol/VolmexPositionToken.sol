// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";

/**
 * @title Token Contract
 * @author .finance [security@labs.com]
 */
contract PositionToken is Initializable, AccessControlUpgradeable, ERC20PausableUpgradeable {
    event UpdatedTokenMetadata(string name, string symbol);

    // Position token role, calculated as keccak256("_PROTOCOL_ROLE")
    bytes32 public constant _PROTOCOL_ROLE = 0x33ba6006595f7ad5c59211bde33456cab351f47602fc04f644c8690bc73c4e16;

    // Openzepplin's ERC20 name and symbol variables are private
    // To add functionality to update the token metadata, we added another variables
    // We added the override public-view method, to compensate on ERC20's methods
    // name of the token
    string private _vivName;
    // symbol of the token
    string private _vivSymbol;

    /**
     * @dev Grants `DEFAULT_ADMIN_ROLE` and `_PROTOCOL_ROLE` to the
     * account that deploys the contract.
     *
     * See {ERC20-constructor}.
     */
    function initialize(string memory _name, string memory _symbol) external initializer {
        __AccessControl_init_unchained();

        __ERC20Pausable_init();
        _vivName = _name;
        _vivSymbol = _symbol;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(_PROTOCOL_ROLE, msg.sender);
    }

    /**
     * @dev Updates token name & symbol of VIV tokens
     *
     * @param _name New string name of the VIV token
     * @param _symbol New string symbol of the VIV token
     */
    function updateTokenMetadata(string memory _name, string memory _symbol) external virtual {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "PositionToken: not admin");
        _vivName = _name;
        _vivSymbol = _symbol;
        emit UpdatedTokenMetadata(_name, _symbol);
    }

    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * See {ERC20-_mint}.
     *
     * Requirements:
     *
     * - the caller must have the `_PROTOCOL_ROLE`.
     */
    function mint(address _to, uint256 _amount) public virtual {
        require(
            hasRole(_PROTOCOL_ROLE, msg.sender),
            "PositionToken: must have  protocol role to mint"
        );
        _mint(_to, _amount);
    }

    /**
     * @dev Destroys `amount` tokens from the caller.
     *
     * See {ERC20-_burn}.
     */
    function burn(address _from, uint256 _amount) public virtual {
        require(
            hasRole(_PROTOCOL_ROLE, msg.sender),
            "PositionToken: must have  protocol role to burn"
        );
        _burn(_from, _amount);
    }

    /**
     * @dev Pauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_pause}.
     *
     * Requirements:
     *
     * - the caller must have the `_PROTOCOL_ROLE`.
     */
    function pause() public virtual {
        require(
            hasRole(_PROTOCOL_ROLE, msg.sender),
            "PositionToken: must have  protocol role to pause"
        );
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_unpause}.
     *
     * Requirements:
     *
     * - the caller must have the `_PROTOCOL_ROLE`.
     */
    function unpause() public virtual {
        require(
            hasRole(_PROTOCOL_ROLE, msg.sender),
            "PositionToken: must have  protocol role to unpause"
        );
        _unpause();
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _vivName;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _vivSymbol;
    }
}
